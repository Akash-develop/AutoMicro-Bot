"""JSON audit stream + optional SQLite replay log."""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)

_AUDIT_LOCK = threading.Lock()


@dataclass
class AuditEntry:
    id: str
    ts: float
    phase: str
    payload: dict[str, Any] = field(default_factory=dict)


class AutomationAuditLog:
    def __init__(self, session_id: Optional[str] = None, sqlite_path: Optional[str] = None):
        self.session_id = session_id or str(uuid.uuid4())
        self._sqlite_path = sqlite_path or os.getenv(
            "AUTOMATION_AUDIT_DB", os.path.join(os.getcwd(), "automation_audit.db")
        )
        self._conn: Optional[sqlite3.Connection] = None
        self._enabled_sqlite = os.getenv("AUTOMATION_AUDIT_SQLITE", "1").strip().lower() not in (
            "0",
            "false",
        )

    def _ensure_db(self) -> None:
        if not self._enabled_sqlite or self._conn is not None:
            return
        self._conn = sqlite3.connect(self._sqlite_path, check_same_thread=False)
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS automation_events (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                ts REAL,
                phase TEXT,
                context_json TEXT,
                ai_decision_json TEXT,
                layer TEXT,
                fallback_json TEXT,
                result_json TEXT
            )
            """
        )
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS automation_replay (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                seq INTEGER,
                action_json TEXT
            )
            """
        )
        self._conn.commit()

    def log_phase(
        self,
        phase: str,
        *,
        context: Optional[dict[str, Any]] = None,
        ai_decision: Optional[dict[str, Any]] = None,
        layer: Optional[str] = None,
        fallback: Optional[list[dict[str, Any]]] = None,
        result: Optional[dict[str, Any]] = None,
    ) -> None:
        entry = AuditEntry(id=str(uuid.uuid4()), ts=time.time(), phase=phase)
        payload = {
            "session_id": self.session_id,
            "phase": phase,
            "context": context,
            "ai_decision": ai_decision,
            "layer": layer,
            "fallback": fallback,
            "result": result,
        }
        line = json.dumps({"id": entry.id, "ts": entry.ts, **payload}, ensure_ascii=False)
        logger.info("automation_audit %s", line)

        if not self._enabled_sqlite:
            return
        with _AUDIT_LOCK:
            self._ensure_db()
            if not self._conn:
                return
            self._conn.execute(
                """
                INSERT INTO automation_events
                (id, session_id, ts, phase, context_json, ai_decision_json, layer, fallback_json, result_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    entry.id,
                    self.session_id,
                    entry.ts,
                    phase,
                    json.dumps(context or {}),
                    json.dumps(ai_decision or {}),
                    layer or "",
                    json.dumps(fallback or []),
                    json.dumps(result or {}),
                ),
            )
            self._conn.commit()

    def record_replay_step(self, seq: int, action: dict[str, Any]) -> None:
        if not self._enabled_sqlite:
            return
        with _AUDIT_LOCK:
            self._ensure_db()
            if not self._conn:
                return
            self._conn.execute(
                "INSERT INTO automation_replay (session_id, seq, action_json) VALUES (?, ?, ?)",
                (self.session_id, seq, json.dumps(action)),
            )
            self._conn.commit()

    def load_replay_sequence(self, session_id: str) -> list[dict[str, Any]]:
        with _AUDIT_LOCK:
            self._ensure_db()
            if not self._conn:
                return []
            cur = self._conn.execute(
                "SELECT action_json FROM automation_replay WHERE session_id = ? ORDER BY seq",
                (session_id,),
            )
            return [json.loads(row[0]) for row in cur.fetchall()]
