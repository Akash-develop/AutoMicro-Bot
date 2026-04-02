"""Post-action validation: compare observation to expected signals."""

from __future__ import annotations

from typing import Any, Optional

from app.automation.models import ObservationSnapshot, StructuredAction, UINode


class FeedbackValidator:
    def validate(
        self,
        action: StructuredAction,
        before: ObservationSnapshot,
        after: ObservationSnapshot,
        *,
        expected_url_contains: Optional[str] = None,
        expected_ax_focus_contains: Optional[str] = None,
    ) -> tuple[bool, str]:
        if action.action == "click" and expected_url_contains:
            # DOM path: URL change is a weak signal (caller passes if known)
            if expected_url_contains.lower() in (after.window_title or "").lower():
                return True, "title/url hint matched"
        if expected_ax_focus_contains and after.ax_root:
            blob = _flatten_ax_text(after.ax_root)
            if expected_ax_focus_contains.lower() in blob.lower():
                return True, "ax text contained expected"
        if after.dom_mutation_pending or after.ax_notification_pending:
            return True, "mutation/event observed"
        if _snapshot_hash(before) != _snapshot_hash(after):
            return True, "observation changed"
        return False, "no detectable UI change"


def _flatten_ax_text(node: UINode, depth: int = 0) -> str:
    if depth > 200:
        return ""
    parts = [node.name or "", node.value or ""]
    for c in node.children:
        parts.append(_flatten_ax_text(c, depth + 1))
    return " ".join(parts)


def _snapshot_hash(obs: ObservationSnapshot) -> str:
    return "|".join(
        [
            obs.front_app,
            obs.window_title,
            obs.screenshot_ref or "",
            str(obs.dom_mutation_pending),
            str(obs.ax_notification_pending),
        ]
    )
