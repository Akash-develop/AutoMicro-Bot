"""Pydantic mirrors of auto-bot/schema/automation — keep field names aligned with JSON Schema."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from app.automation.constants import AUTOMATION_SCHEMA_VERSION


class Bounds(BaseModel):
    x: float
    y: float
    w: float
    h: float


class UINode(BaseModel):
    schema_version: Literal["1.0"] = Field(default=AUTOMATION_SCHEMA_VERSION)
    id: str
    type: str
    name: str = ""
    value: Optional[str] = None
    bounds: Bounds = Field(default_factory=lambda: Bounds(x=0, y=0, w=0, h=0))
    children: list["UINode"] = Field(default_factory=list)


UINode.model_rebuild()


class ActionTarget(BaseModel):
    type: Literal["text", "role", "selector", "coords", "xpath", "label"]
    value: str


class StructuredAction(BaseModel):
    schema_version: Literal["1.0"] = Field(default=AUTOMATION_SCHEMA_VERSION)
    action: Literal["click", "type", "scroll", "focus", "press", "wait"]
    target: ActionTarget
    confidence: float = Field(ge=0, le=1)
    payload: dict[str, Any] = Field(default_factory=dict)


class LayerExecutionResult(BaseModel):
    schema_version: Literal["1.0"] = Field(default=AUTOMATION_SCHEMA_VERSION)
    success: bool
    confidence: float = Field(ge=0, le=1)
    method: str
    layer: Literal["dom", "ax", "vision", "input", "script", "orchestrator"]
    error: Optional[str] = None
    evidence: dict[str, Any] = Field(default_factory=dict)


class LayerAttemptRecord(BaseModel):
    layer: str
    at: str
    outcome: str
    confidence: Optional[float] = None


class AutomationStateSnapshot(BaseModel):
    schema_version: Literal["1.0"] = Field(default=AUTOMATION_SCHEMA_VERSION)
    frontApp: str = ""
    windowTitle: str = ""
    lastAction: str = ""
    status: Literal["idle", "running", "success", "failed", "pending_confirmation"] = "idle"
    retryCount: int = 0
    layerAttempts: list[LayerAttemptRecord] = Field(default_factory=list)


class ResolvedTarget(BaseModel):
    """Output of ActionResolver — normalized hints for DOM and AX."""

    schema_version: Literal["1.0"] = Field(default=AUTOMATION_SCHEMA_VERSION)
    role_hint: str = ""
    label: str = ""
    selector_hint: str = ""
    ax_role: str = ""
    text_tokens: list[str] = Field(default_factory=list)


class ObservationSnapshot(BaseModel):
    schema_version: Literal["1.0"] = Field(default=AUTOMATION_SCHEMA_VERSION)
    partial: bool = False
    front_app: str = ""
    window_title: str = ""
    dom_root: Optional[UINode] = None
    ax_root: Optional[UINode] = None
    screenshot_ref: Optional[str] = None
    dom_mutation_pending: bool = False
    ax_notification_pending: bool = False
