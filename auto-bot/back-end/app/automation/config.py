"""Runtime automation configuration (env + overrides)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from app.automation.constants import (
    DEFAULT_AX_TIMEOUT_S,
    DEFAULT_DOM_TIMEOUT_S,
    DEFAULT_INPUT_TIMEOUT_S,
    DEFAULT_MIN_CONFIDENCE_AX,
    DEFAULT_MIN_CONFIDENCE_DOM,
    DEFAULT_MIN_CONFIDENCE_INPUT,
    DEFAULT_MIN_CONFIDENCE_VISION,
    DEFAULT_SCRIPT_TIMEOUT_S,
    DEFAULT_VISION_TIMEOUT_S,
    EXECUTION_MODE_AI_ASSISTED,
    EXECUTION_MODE_DETERMINISTIC,
)


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


@dataclass
class AutomationConfig:
    execution_mode: str = field(
        default_factory=lambda: os.getenv("AUTOMATION_MODE", EXECUTION_MODE_AI_ASSISTED)
    )
    max_retries: int = field(default_factory=lambda: _int("AUTOMATION_MAX_RETRIES", 4))
    parallel_ax_vision: bool = field(
        default_factory=lambda: _bool("AUTOMATION_PARALLEL_AX_VISION", False)
    )
    require_sensitive_confirmation: bool = field(
        default_factory=lambda: _bool("AUTOMATION_SENSITIVE_CONFIRM", False)
    )
    state_cache_ttl_ms: int = field(default_factory=lambda: _int("AUTOMATION_STATE_CACHE_MS", 400))
    supervisor_restart_max: int = field(default_factory=lambda: _int("AUTOMATION_SUPERVISOR_RESTART_MAX", 3))
    health_interval_s: float = field(default_factory=lambda: _float("AUTOMATION_HEALTH_INTERVAL_S", 5.0))
    unresponsive_after_s: float = field(default_factory=lambda: _float("AUTOMATION_UNRESPONSIVE_S", 8.0))

    timeout_dom_s: float = field(default_factory=lambda: _float("AUTOMATION_TIMEOUT_DOM", DEFAULT_DOM_TIMEOUT_S))
    timeout_ax_s: float = field(default_factory=lambda: _float("AUTOMATION_TIMEOUT_AX", DEFAULT_AX_TIMEOUT_S))
    timeout_vision_s: float = field(
        default_factory=lambda: _float("AUTOMATION_TIMEOUT_VISION", DEFAULT_VISION_TIMEOUT_S)
    )
    timeout_input_s: float = field(
        default_factory=lambda: _float("AUTOMATION_TIMEOUT_INPUT", DEFAULT_INPUT_TIMEOUT_S)
    )
    timeout_script_s: float = field(
        default_factory=lambda: _float("AUTOMATION_TIMEOUT_SCRIPT", DEFAULT_SCRIPT_TIMEOUT_S)
    )

    min_confidence_dom: float = field(
        default_factory=lambda: _float("AUTOMATION_MIN_CONF_DOM", DEFAULT_MIN_CONFIDENCE_DOM)
    )
    min_confidence_ax: float = field(
        default_factory=lambda: _float("AUTOMATION_MIN_CONF_AX", DEFAULT_MIN_CONFIDENCE_AX)
    )
    min_confidence_vision: float = field(
        default_factory=lambda: _float("AUTOMATION_MIN_CONF_VISION", DEFAULT_MIN_CONFIDENCE_VISION)
    )
    min_confidence_input: float = field(
        default_factory=lambda: _float("AUTOMATION_MIN_CONF_INPUT", DEFAULT_MIN_CONFIDENCE_INPUT)
    )

    chrome_debug_port: int = field(default_factory=lambda: _int("CHROME_DEBUG_PORT", 9222))
    allowlist_bundle_ids: list[str] = field(default_factory=list)
    blocklist_bundle_ids: list[str] = field(default_factory=list)

    vision_llm_endpoint: str = field(
        default_factory=lambda: os.getenv("AUTOMATION_VISION_LLM_URL", "").strip()
    )
    vision_llm_api_key: str = field(default_factory=lambda: os.getenv("AUTOMATION_VISION_LLM_KEY", ""))

    def is_deterministic(self) -> bool:
        return self.execution_mode == EXECUTION_MODE_DETERMINISTIC
