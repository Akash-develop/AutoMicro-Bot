"""
app/routes/chat.py
FastAPI routes for standard Chat POST and WebSocket streaming.
"""
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from starlette.websockets import WebSocketState
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
        # Bug #3 fix: actually retry instead of the old dead `pass`
        if "thought_signature" in error_msg:
            logger.warning("Resiliently retrying after thought_signature artifact...")
            try:
                response_text = await get_agent_response(req.session_id, req.message)
                return ChatResponse(response=response_text, session_id=req.session_id)
            except Exception as retry_err:
                logger.error(f"Retry also failed: {retry_err}")
                raise HTTPException(status_code=500, detail=str(retry_err))
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


# Bug #5 fix: clear only messages, keep the conversation record
@router.delete("/history/{session_id}/messages", response_model=DeleteResponse)
async def clear_messages_endpoint(session_id: str):
    """Clear all messages for a session but keep the conversation record."""
    try:
        await clear_history(session_id)
        return DeleteResponse(
            session_id=session_id,
            deleted=1,
            message="Messages cleared successfully"
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

@router.post("/terminal/open")
async def open_terminal_endpoint():
    """Quickly open a local terminal window (macOS)."""
    try:
        import subprocess
        subprocess.run(["open", "-a", "Terminal", "."], check=True)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Failed to open terminal: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
            # Bug #8 fix: use original user text for title (not attachment-prepended version)
            original_user_text = payload.get("message", "")
            if await is_first_message(session_id):
                await create_conversation(session_id, make_title(original_user_text or user_message))

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

            # --- Streaming Loop ---
            full_response = ""
            max_retries = 2
            
            for attempt in range(max_retries):
                try:
                    # On retry (attempt > 0), pass None to tell LangGraph to resume from checkpointer
                    stream_inputs = input_messages if attempt == 0 else None
                    async for chunk, metadata in app.astream(
                        stream_inputs,
                        config,
                        stream_mode="messages"
                    ):
                        # Bug #6 fix: use WebSocketState enum instead of magic number
                        if websocket.client_state != WebSocketState.CONNECTED:
                            break

                        content = getattr(chunk, "content", None)
                        chunk_type = chunk.__class__.__name__

                        # 1. Handle Text Tokens
                        if chunk_type in ("AIMessageChunk", "AIMessage") and isinstance(content, str) and content:
                            full_response += content
                            await websocket.send_text(json.dumps({
                                "type": "token",
                                "content": content
                            }))
                        
                        # 2. Handle Tool Activations
                        tool_call_chunks = getattr(chunk, "tool_call_chunks", None)
                        if tool_call_chunks:
                            for tc in tool_call_chunks:
                                if tc.get("name"):
                                    await websocket.send_text(json.dumps({
                                        "type": "tool_start",
                                        "command": tc["name"]
                                    }))
                        
                        # 3. Handle Tool Results
                        if chunk_type in ("ToolMessageChunk", "ToolMessage") and getattr(chunk, "name", None):
                            await websocket.send_text(json.dumps({
                                "type": "tool_output",
                                "result": str(content)
                            }))
                            
                    # If stream finished successfully without error, break retry loop
                    break

                except Exception as stream_err:
                    error_msg = str(stream_err)
                    if "thought_signature" in error_msg and attempt < max_retries - 1:
                        logger.warning(f"Resiliently retrying stream after thought_signature (attempt {attempt + 1})...")
                        continue
                    else:
                        logger.error(f"Stream interrupted: {error_msg}")
                        await websocket.send_text(json.dumps({"type": "error", "content": error_msg}))
                        break

            # --- Post-Stream Completion ---
            await save_message(session_id, "assistant", full_response.strip())
            await websocket.send_text(json.dumps({"type": "done"}))

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
