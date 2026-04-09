"""
app/routes/chat.py
FastAPI routes for standard Chat POST and WebSocket streaming.
"""
import json
import logging
import time
import sqlite3
import os
from fastapi import APIRouter, HTTPException, Request
from starlette.responses import StreamingResponse
from app.models.schemas import (
    ChatRequest, ChatResponse, HistoryResponse, MessageRecord,
    DeleteResponse, SessionSummary, RenameRequest, ChatStreamRequest
)
from app.graph.agent import (
    get_agent_response,
    get_app,
    get_app_interrupt_after_tools,
    DEFAULT_AGENT_RECURSION_LIMIT,
)
from app.db.database import (
    get_history, clear_history, save_message,
    get_all_conversations, create_conversation, rename_conversation,
    delete_conversation, is_first_message
)
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

router = APIRouter()
logger = logging.getLogger(__name__)

_STM_DB_PATH = os.getenv("STM_DB_PATH", "stm.db")

def _clear_thread_checkpoints(thread_id: str) -> None:
    """Clear LangGraph sqlite checkpointer state for one thread_id."""
    try:
        con = sqlite3.connect(_STM_DB_PATH)
        try:
            con.execute("DELETE FROM writes WHERE thread_id = ?", (thread_id,))
            con.execute("DELETE FROM checkpoints WHERE thread_id = ?", (thread_id,))
            con.commit()
        finally:
            con.close()
    except Exception:
        # Best-effort only; if this fails we will surface the original error.
        pass


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

        response_text = await get_agent_response(req.session_id, req.message, agent_mode=req.mode)
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
                response_text = await get_agent_response(req.session_id, req.message, agent_mode=req.mode)
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
        p = subprocess.Popen(["open", "-a", "Terminal", "."])
        rc = p.wait()
        if rc != 0:
            raise RuntimeError(f"open-terminal exited with code {rc}")
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Failed to open terminal: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _sse(event: str, data: dict) -> str:
    # SSE format: https://html.spec.whatwg.org/multipage/server-sent-events.html
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/chat/stream")
async def chat_stream_endpoint(request: Request, req: ChatStreamRequest):
    """HTTP SSE endpoint for token-by-token streaming using LangGraph."""

    async def event_generator():
        session_id = req.session_id
        user_message = req.message
        attachment = req.attachment.model_dump() if req.attachment else None

        # Incorporate file attachment context
        image_content = None
        if attachment and attachment.get("name") and attachment.get("content"):
            file_name = attachment["name"]
            file_content = attachment["content"]
            mime_type = attachment.get("mime_type", "text/plain") or "text/plain"

            if mime_type.startswith("image/"):
                # For images, we pass multi-modal content
                image_content = {
                    "type": "image_url",
                    "image_url": {"url": file_content},  # expected to be a data URL
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
        original_user_text = req.message or ""
        if await is_first_message(session_id):
            await create_conversation(session_id, make_title(original_user_text or user_message))

        # Construct content for HumanMessage
        if image_content:
            message_content = [{"type": "text", "text": user_message}, image_content]
        else:
            message_content = user_message

        input_messages = {"messages": [HumanMessage(content=message_content)]}
        await save_message(session_id, "user", user_message, attachment if image_content else None)

        agent_mode = req.mode if req.mode in ("chat", "plan") else "plan"
        app = await (get_app_interrupt_after_tools(agent_mode=agent_mode) if agent_mode == "plan" else get_app(agent_mode=agent_mode))
        config = {
            "configurable": {"thread_id": session_id},
            "recursion_limit": DEFAULT_AGENT_RECURSION_LIMIT,
        }

        full_response: str = ""
        last_tool_result: str | None = None
        max_retries = 2
        # Buffer to accumulate streamed tool-call argument fragments
        _tc_args_buf: dict[str, dict] = {}
        _force_inputs_next_attempt = False

        for attempt in range(max_retries):
            try:
                stream_inputs = input_messages if (attempt == 0 or _force_inputs_next_attempt) else None
                _force_inputs_next_attempt = False
                async for chunk, metadata in app.astream(
                    stream_inputs,
                    config,
                    stream_mode="messages",
                ):
                    if await request.is_disconnected():
                        logger.info("SSE client disconnected; stopping stream")
                        return

                    content = getattr(chunk, "content", None)
                    chunk_type = chunk.__class__.__name__

                    # 1) Text tokens
                    if chunk_type in ("AIMessageChunk", "AIMessage") and isinstance(content, str) and content:
                        full_response += content
                        yield _sse("token", {"content": content})

                    # 2) Tool activations — accumulate args fragments
                    tool_call_chunks = getattr(chunk, "tool_call_chunks", None)
                    if tool_call_chunks:
                        for tc in tool_call_chunks:
                            tc_id = tc.get("id") or str(tc.get("index", 0))
                            if tc.get("name"):
                                # Some providers repeat the tool name across multiple chunks for the same call.
                                # Emit tool_start only once per tool-call id to avoid duplicate UI tool cards.
                                if tc_id not in _tc_args_buf:
                                    _tc_args_buf[tc_id] = {"name": tc["name"], "args": ""}
                                    yield _sse("tool_start", {"command": tc["name"]})
                            if tc.get("args") and tc_id in _tc_args_buf:
                                _tc_args_buf[tc_id]["args"] += tc["args"]
                                try:
                                    parsed = json.loads(_tc_args_buf[tc_id]["args"])
                                    yield _sse("tool_command", {
                                        "tool": _tc_args_buf[tc_id]["name"],
                                        "args": parsed,
                                    })
                                except (json.JSONDecodeError, ValueError):
                                    pass  # args still incomplete, keep accumulating

                    # 3) Tool results
                    if chunk_type in ("ToolMessageChunk", "ToolMessage") and getattr(chunk, "name", None):
                        last_tool_result = str(content)
                        yield _sse("tool_output", {"result": str(content)})

                break

            except Exception as stream_err:
                error_msg = str(stream_err)
                if (
                    ("INVALID_CHAT_HISTORY" in error_msg)
                    or ("tool_calls that do not have a corresponding ToolMessage" in error_msg)
                ) and attempt < max_retries - 1:
                    # This happens when a previous run was interrupted after the model emitted a tool call
                    # but before the corresponding ToolMessage was checkpointed. Clear checkpoints for
                    # this session and retry once.
                    _clear_thread_checkpoints(session_id)
                    _force_inputs_next_attempt = True
                    continue
                if "thought_signature" in error_msg and attempt < max_retries - 1:
                    logger.warning(
                        f"Resiliently retrying stream after thought_signature (attempt {attempt + 1})..."
                    )
                    continue

                logger.error(f"Stream interrupted: {error_msg}")
                if "unauthorized" in error_msg.lower() or "401" in error_msg:
                    suggestion = (
                        "\n\n**Note:** This 'unauthorized' error often happens if your Base URL is wrong. "
                        "If you are using SiliconFlow, ensure your provider is 'OpenAI-Compatible' and "
                        "the URL is `https://api.siliconflow.cn/v1`. "
                        "Do NOT use `https://ollama.com` as an API URL."
                    )
                    yield _sse("error", {"content": error_msg + suggestion})
                else:
                    yield _sse("error", {"content": error_msg})
                return

        final_text = full_response.strip()
        if agent_mode == "plan" and last_tool_result:
            # We intentionally interrupted after the tools node to prevent repeated tool loops.
            # Generate a brief final message with a tool-free model call.
            try:
                from app.graph.agent import get_llm

                llm = await get_llm()
                sys = SystemMessage(
                    content=(
                        "You are AutoMicro-Bot. Write a short, friendly confirmation message "
                        "based on the user's request and the tool result. Do NOT call tools."
                    )
                )
                hm = HumanMessage(
                    content=(
                        f"User request:\n{req.message}\n\n"
                        f"Tool result:\n{last_tool_result}\n\n"
                        "Respond in 1-2 sentences."
                    )
                )
                async for chunk in llm.astream([sys, hm]):
                    c = getattr(chunk, "content", None)
                    if isinstance(c, str) and c:
                        final_text += c
                        yield _sse("token", {"content": c})
            except Exception as e:
                logger.warning("Final text generation failed: %s", e)

        final_text = final_text.strip()
        if final_text:
            await save_message(session_id, "assistant", final_text)
        yield _sse("done", {})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
