"""Load canonical JSON Schema files and validate payloads at IPC boundaries."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any

import jsonschema
from jsonschema import Draft202012Validator

_SCHEMA_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "schema", "automation")
)


@lru_cache
def _validator(name: str) -> Draft202012Validator:
    path = os.path.join(_SCHEMA_DIR, name)
    with open(path, encoding="utf-8") as f:
        schema = json.load(f)
    return Draft202012Validator(schema)


def validate_payload(schema_file: str, data: dict[str, Any], *, outbound: bool = False) -> None:
    """
    Raises jsonschema.ValidationError if invalid.
    outbound: same validation either way; flag reserved for future logging hooks.
    """
    _ = outbound
    v = _validator(schema_file)
    v.validate(data)


def validate_ui_node(data: dict[str, Any]) -> None:
    validate_payload("ui-node.schema.json", data)


def validate_action(data: dict[str, Any]) -> None:
    validate_payload("action.schema.json", data)


def validate_execution_result(data: dict[str, Any]) -> None:
    validate_payload("execution-result.schema.json", data)


def validate_state(data: dict[str, Any]) -> None:
    validate_payload("state.schema.json", data)


def validate_ipc_envelope(data: dict[str, Any]) -> None:
    validate_payload("ipc-envelope.schema.json", data)
