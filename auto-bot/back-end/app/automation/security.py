"""Allowlist/blocklist, action categories, sensitive-action gating."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.automation.constants import ACTION_CATEGORY_SAFE, ACTION_CATEGORY_SENSITIVE
from app.automation.models import StructuredAction

DEFAULT_BLOCKLIST_BUNDLE_IDS = frozenset(  # exported for orchestrator merge
    {
        "com.apple.systempreferences",
        "com.apple.preference.security",
        "com.apple.keychainaccess",
    }
)


@dataclass
class SecurityPolicy:
    allowlist_bundle_ids: list[str] = field(default_factory=list)
    blocklist_bundle_ids: list[str] = field(
        default_factory=lambda: list(DEFAULT_BLOCKLIST_BUNDLE_IDS)
    )
    require_sensitive_confirmation: bool = False

    def bundle_allowed(self, bundle_id: str) -> tuple[bool, str]:
        bid = (bundle_id or "").strip()
        if bid in self.blocklist_bundle_ids:
            return False, f"blocked bundle: {bid}"
        if self.allowlist_bundle_ids and bid not in self.allowlist_bundle_ids:
            return False, f"not in allowlist: {bid}"
        return True, "ok"

    def action_category(self, action: StructuredAction) -> str:
        if action.action in ACTION_CATEGORY_SENSITIVE:
            return "sensitive"
        if action.action in ACTION_CATEGORY_SAFE:
            return "safe"
        return "sensitive"

    def sensitive_ok(self, action: StructuredAction, confirmed: bool) -> tuple[bool, Optional[str]]:
        if self.action_category(action) == "sensitive" and self.require_sensitive_confirmation:
            if not confirmed:
                return False, "sensitive action requires confirmed_sensitive=true"
        return True, None
