"""JSON-lines IPC with schema_version on every envelope."""

from __future__ import annotations

import json
import uuid
from typing import Any, Optional

from app.automation.constants import AUTOMATION_SCHEMA_VERSION
from app.automation.schema_validation import validate_ipc_envelope


def build_request(method: str, params: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    return {
        "schema_version": AUTOMATION_SCHEMA_VERSION,
        "id": str(uuid.uuid4()),
        "kind": "request",
        "method": method,
        "params": params or {},
    }


def build_response(req_id: str, result: Any = None, error: Optional[str] = None) -> dict[str, Any]:
    return {
        "schema_version": AUTOMATION_SCHEMA_VERSION,
        "id": req_id,
        "kind": "response",
        "result": result,
        "error": error,
    }


def encode_line(obj: dict[str, Any]) -> str:
    return json.dumps(obj, ensure_ascii=False) + "\n"


def decode_line(line: str) -> dict[str, Any]:
    data = json.loads(line.strip())
    if isinstance(data, dict):
        validate_ipc_envelope(data)
    return data


def parse_result_payload(resp: dict[str, Any]) -> Any:
    if resp.get("error"):
        raise RuntimeError(resp["error"])
    return resp.get("result")
