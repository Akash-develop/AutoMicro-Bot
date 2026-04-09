"""
Plan-mode todo tools.

These replicate "TodoListMiddleware"-style behavior using normal LangChain tools:
- `write_todos`: persist the current todo list for the session
- `read_todos`: load the current todo list for the session
"""

import json
import logging
from typing import Annotated

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import InjectedToolArg, tool

from app.db.database import load_session_todos, save_session_todos
from app.graph.tools.permission_manager import check_permission

logger = logging.getLogger(__name__)

_VALID_STATUSES = frozenset({"pending", "in_progress", "completed", "cancelled"})


def _normalize(raw: list) -> list[dict]:
    out: list[dict] = []
    for i, item in enumerate(raw or []):
        if not isinstance(item, dict):
            continue
        tid = str(item.get("id") or f"task-{i + 1}")
        title = str(item.get("title") or item.get("content") or "").strip() or "Untitled"
        status = str(item.get("status", "pending")).lower().strip()
        if status not in _VALID_STATUSES:
            status = "pending"
        out.append({"id": tid, "title": title, "status": status})
    return out


@tool
@check_permission("write_todos")
async def write_todos(
    todos: list,
    config: Annotated[RunnableConfig, InjectedToolArg()],
) -> str:
    """Replace the todo list for this conversation session."""
    session_id = (config or {}).get("configurable", {}).get("thread_id") or "default"
    normalized = _normalize(todos)
    try:
        await save_session_todos(session_id, normalized)
    except Exception as e:
        logger.error("write_todos failed: %s", e)
        return f"Error saving todos: {e}"
    return json.dumps({"ok": True, "todos": normalized}, ensure_ascii=False)


@tool
@check_permission("read_todos")
async def read_todos(config: Annotated[RunnableConfig, InjectedToolArg()]) -> str:
    """Read the todo list for this conversation session."""
    session_id = (config or {}).get("configurable", {}).get("thread_id") or "default"
    try:
        items = await load_session_todos(session_id)
    except Exception as e:
        logger.error("read_todos failed: %s", e)
        return f"Error loading todos: {e}"
    return json.dumps({"todos": items}, ensure_ascii=False)

