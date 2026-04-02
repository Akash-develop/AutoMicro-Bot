"""Observation layer: DOM / AX / optional screenshot; partial refresh; normalized schema."""

from __future__ import annotations

import time
from typing import Any, Optional

from app.automation.config import AutomationConfig
from app.automation.models import ObservationSnapshot, UINode
from app.automation.schema_validation import validate_ui_node
from app.automation.supervisor import ProcessSupervisor
from app.automation.events import EventCoordinator


class Observer:
    def __init__(
        self,
        config: AutomationConfig,
        supervisor: Optional[ProcessSupervisor] = None,
        events: Optional[EventCoordinator] = None,
    ):
        self._config = config
        self._supervisor = supervisor
        self._events = events or EventCoordinator(supervisor)
        self._cache: tuple[float, ObservationSnapshot] | None = None

    def _cached(self, snap: ObservationSnapshot) -> ObservationSnapshot:
        now = time.time() * 1000
        if self._cache and now - self._cache[0] < self._config.state_cache_ttl_ms:
            prev = self._cache[1]
            snap.dom_root = snap.dom_root or prev.dom_root
            snap.ax_root = snap.ax_root or prev.ax_root
        self._cache = (now, snap)
        return snap

    def observe(
        self,
        *,
        want_dom: bool = False,
        want_ax: bool = False,
        screenshot_ref: Optional[str] = None,
        partial: bool = False,
    ) -> ObservationSnapshot:
        snap = ObservationSnapshot(partial=partial)
        if want_dom and self._supervisor:
            try:
                raw = self._supervisor.request(
                    "dom",
                    "getDomTree",
                    {"port": self._config.chrome_debug_port},
                    timeout_s=self._config.timeout_dom_s,
                )
                if isinstance(raw, dict) and raw.get("root") and not raw.get("error"):
                    validate_ui_node(raw["root"])
                    snap.dom_root = UINode.model_validate(raw["root"])
                snap.dom_mutation_pending = False
            except Exception:
                snap.dom_root = None
        if want_ax and self._supervisor:
            try:
                raw = self._supervisor.request(
                    "swift",
                    "axTree",
                    {"maxDepth": 12 if not partial else 6},
                    timeout_s=self._config.timeout_ax_s,
                )
                if isinstance(raw, dict) and raw.get("root") and not raw.get("error"):
                    validate_ui_node(raw["root"])
                    snap.ax_root = UINode.model_validate(raw["root"])
                snap.ax_notification_pending = False
            except Exception:
                snap.ax_root = None
        if screenshot_ref:
            snap.screenshot_ref = screenshot_ref
        return self._cached(snap)

    def refresh_after_action(self, prev: ObservationSnapshot, **kwargs: Any) -> ObservationSnapshot:
        return self.observe(
            want_dom=prev.dom_root is not None or kwargs.get("want_dom", False),
            want_ax=prev.ax_root is not None or kwargs.get("want_ax", False),
            screenshot_ref=kwargs.get("screenshot_ref"),
            partial=kwargs.get("partial", True),
        )
