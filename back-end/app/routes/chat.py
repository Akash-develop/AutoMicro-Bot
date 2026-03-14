"""
app/routes/chat.py
FastAPI routes for standard Chat POST and WebSocket streaming.
"""
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from app.models.schemas import (
    ChatRequest, ChatResponse, HistoryResponse, MessageRecord,
    DeleteResponse, SessionSummary, RenameRequest
)
from app.graph.agent import get_agent_response, get_app
from app.db.database import (
    get_history, clear_history, save_message,
    get_all_conversations, create_conversation, rename_conversation,
    delete_conversation, is_first_message
)
from langchain_core.messages import HumanMessage, AIMessage

router = APIRouter()
logger = logging.getLogger(__name__)


def make_title(message: str, max_len: int = 50) -> str:
    """Generate a conversation title from the first user message."""
    title = message.strip().replace("\n", " ")
    return title if len(title) <= max_len else title[:max_len].rstrip() + "…"


# ─── Chat Endpoints ───────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    """Standard POST endpoint for blocking chat requests."""
    try:
        # Auto-create conversation on the very first message
        if await is_first_message(req.session_id):
            await create_conversation(req.session_id, make_title(req.message))

        response_text = await get_agent_response(req.session_id, req.message)
        return ChatResponse(
            response=response_text,
            session_id=req.session_id
        )
    except Exception as e:
        error_msg = str(e)
        if "thought_signature" in error_msg:
            # Re-run getting agent response if the tool call failed due to parsing on Ollama
            pass
        logger.error(f"Error in chat endpoint: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)


# ─── History Endpoints ────────────────────────────────────────────────────────

@router.get("/history", response_model=list[SessionSummary])
async def list_history_endpoint():
    """List all conversations with titles, ordered by last active."""
    try:
        return await get_all_conversations()
    except Exception as e:
        logger.error(f"Error in list history endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{session_id}", response_model=list[MessageRecord])
async def history_endpoint(session_id: str):
    """Retrieve chat history for a given session."""
    try:
        return await get_history(session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/history/{session_id}", response_model=DeleteResponse)
async def delete_history_endpoint(session_id: str):
    """Delete a conversation and all its messages."""
    try:
        await delete_conversation(session_id)
        return DeleteResponse(
            session_id=session_id,
            deleted=1,
            message="Conversation deleted successfully"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Conversation Management ──────────────────────────────────────────────────

@router.patch("/conversations/{session_id}", response_model=SessionSummary)
async def rename_conversation_endpoint(session_id: str, req: RenameRequest):
    """Rename a conversation."""
    try:
        await rename_conversation(session_id, req.title)
        # Return updated conversation list entry
        convos = await get_all_conversations()
        updated = next((c for c in convos if c["session_id"] == session_id), None)
        if not updated:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error renaming conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── WebSocket Streaming ──────────────────────────────────────────────────────

@router.websocket("/ws/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for token-by-token streaming using LangGraph."""
    await websocket.accept()
    try:
        app = await get_app()
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            user_message = payload.get("message")
            attachment = payload.get("attachment")

            if not user_message:
                continue
            
            # Incorporate file attachment context
            image_content = None
            if attachment and attachment.get("name") and attachment.get("content"):
                file_name = attachment["name"]
                file_content = attachment["content"]
                mime_type = attachment.get("mime_type", "text/plain")

                if mime_type.startswith("image/"):
                    # For images, we will pass them as multi-modal content
                    image_content = {
                        "type": "image_url",
                        "image_url": {"url": file_content} # content is expected to be data URL
                    }
                else:
                    # For text files, prepend to message
                    user_message = (
                        f"[Attached File: {file_name}]\n"
                        f"--- FILE CONTENT START ---\n"
                        f"{file_content}\n"
                        f"--- FILE CONTENT END ---\n\n"
                        f"{user_message}"
                    )

            # Auto-create conversation on first message
            if await is_first_message(session_id):
                await create_conversation(session_id, make_title(user_message))

            config = {"configurable": {"thread_id": session_id}}
            
            # Construct content for HumanMessage
            if image_content:
                message_content = [
                    {"type": "text", "text": user_message},
                    image_content
                ]
            else:
                message_content = user_message

            input_messages = {"messages": [HumanMessage(content=message_content)]}
            await save_message(session_id, "user", user_message)

            full_response = ""
            async for chunk, metadata in app.astream(
                input_messages,
                config,
                stream_mode="messages"
            ):
                # Check for client disconnect to abort processing immediately
                if websocket.client_state.value != 1: # 1 is CLOSED (benign disconnect check)
                    # Use a more standard check for FastAPI/Starlette
                    break

                content = getattr(chunk, "content", None)
                chunk_type = chunk.__class__.__name__

                # Stream regular text tokens
                if chunk_type in ("AIMessageChunk", "AIMessage") and isinstance(content, str) and content:
                    full_response += content
                    await websocket.send_text(json.dumps({
                        "type": "token",
                        "content": content
                    }))
                
                # Stream tool start
                tool_call_chunks = getattr(chunk, "tool_call_chunks", None)
                if tool_call_chunks:
                    for tc in tool_call_chunks:
                        if tc.get("name"):
                            await websocket.send_text(json.dumps({
                                "type": "tool_start",
                                "command": tc["name"]
                            }))
                            # Removed redundant text note: it's already visual in the frontend
                
                # Stream tool output
                if chunk_type in ("ToolMessageChunk", "ToolMessage") and getattr(chunk, "name", None):
                    await websocket.send_text(json.dumps({
                        "type": "tool_output",
                        "result": str(content)
                    }))
                    # Removed redundant text note

            await save_message(session_id, "assistant", full_response.strip())

            await websocket.send_text(json.dumps({
                "type": "done"
            }))

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        error_msg = str(e)
        # Suppress benign streaming errors from LLM providers
        if "thought_signature" in error_msg:
            # We ignore this error because Llama tool streaming with Ollama sometimes throws it
            # But we must NOT return/break here, otherwise the chain stops and no final answer is given
            logger.warning(f"Ignored Ollama thought_signature parsing error: {error_msg}")
            # Try to send a done message gracefully just in case this actually was the end
            try:
                await websocket.send_text(json.dumps({"type": "done"}))
            except:
                pass
            return

        logger.error(f"WebSocket error: {error_msg}")
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "content": error_msg
            }))
        except:
            pass
