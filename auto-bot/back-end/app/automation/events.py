"""Event-driven UI updates with polling fallback (DOM CDP / AX notifications)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from app.automation.supervisor import ProcessSupervisor


@dataclass
class DomWatchHandle:
    job_id: str
    active: bool = True


class EventCoordinator:
    """Coordinates optional mutation observers (DOM) and AX notifications."""

    def __init__(self, supervisor: Optional[ProcessSupervisor] = None):
        self._supervisor = supervisor
        self._dom_handles: dict[str, DomWatchHandle] = {}

    def start_dom_watch(self, selector: str) -> Optional[str]:
        if not self._supervisor:
            return None
        try:
            res = self._supervisor.request("dom", "watchDom", {"selector": selector}, timeout_s=2.0)
            job_id = str((res or {}).get("jobId", ""))
            if job_id:
                self._dom_handles[job_id] = DomWatchHandle(job_id=job_id)
            return job_id or None
        except Exception:
            return None

    def poll_dom_event(self, job_id: str) -> bool:
        if not self._supervisor or job_id not in self._dom_handles:
            return False
        try:
            res = self._supervisor.request("dom", "pollWatch", {"jobId": job_id}, timeout_s=1.0)
            return bool((res or {}).get("fired"))
        except Exception:
            return False

    def ax_events_enabled(self) -> bool:
        # Full AXObserver requires persistent Swift service; CLI uses polling fallback.
        return False
