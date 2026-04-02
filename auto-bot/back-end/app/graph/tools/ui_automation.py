"""Permission-gated UI automation tool → orchestrator."""

from __future__ import annotations

import logging
from typing import Optional

from langchain_core.tools import tool

from app.automation.orchestrator import AutomationOrchestrator
from app.graph.tools.permission_manager import check_permission, load_permissions

logger = logging.getLogger(__name__)


@tool
@check_permission("run_ui_automation")
def run_ui_automation(
    intent: str,
    browser_session_id: Optional[str] = None,
    front_app_bundle: str = "",
    confirmed_sensitive: bool = False,
) -> str:
    """
    Execute a short UI automation intent (click/type/scroll) using the layered stack
    (DOM if Chrome remote debugging is available, else AX → Vision → Input).
    Enable per-layer toggles and this tool in Settings.
    """
    perms = load_permissions()
    try:
        orch = AutomationOrchestrator(permissions=perms)
        orch.ensure_children()
        return orch.run(
            intent,
            browser_session_id=browser_session_id,
            front_app_bundle=front_app_bundle,
            confirmed_sensitive=confirmed_sensitive,
        )
    except Exception as e:
        logger.exception("run_ui_automation failed")
        return f"UI automation error: {e}"
