"""Mutable automation state with layer attempt history."""

from __future__ import annotations

import copy
from typing import Optional

from app.automation.models import AutomationStateSnapshot, LayerAttemptRecord


class StateEngine:
    def __init__(self, initial: Optional[AutomationStateSnapshot] = None):
        self._state = initial or AutomationStateSnapshot()

    @property
    def snapshot(self) -> AutomationStateSnapshot:
        return copy.deepcopy(self._state)

    def reset_run(self) -> None:
        self._state.retryCount = 0
        self._state.layerAttempts = []
        self._state.status = "idle"

    def set_running(self, last_action: str) -> None:
        self._state.status = "running"
        self._state.lastAction = last_action

    def set_context(self, front_app: str, window_title: str) -> None:
        self._state.frontApp = front_app
        self._state.windowTitle = window_title

    def bump_retry(self) -> None:
        self._state.retryCount += 1

    def record_attempt(self, layer: str, outcome: str, confidence: Optional[float] = None) -> None:
        import datetime

        self._state.layerAttempts.append(
            LayerAttemptRecord(
                layer=layer,
                at=datetime.datetime.utcnow().isoformat() + "Z",
                outcome=outcome,
                confidence=confidence,
            )
        )

    def finalize_success(self) -> None:
        self._state.status = "success"

    def finalize_failed(self) -> None:
        self._state.status = "failed"

    def finalize_pending_confirmation(self) -> None:
        self._state.status = "pending_confirmation"
