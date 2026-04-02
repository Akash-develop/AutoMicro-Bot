"""Layer selection, confidence comparison, parallel AX+Vision optional."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Optional

from app.automation.config import AutomationConfig
from app.automation.models import LayerExecutionResult
from app.automation.retry_manager import RetryManager


@dataclass
class ExecutionContext:
    browser_session_id: Optional[str] = None
    front_app_bundle: str = ""
    controlled_browser: bool = False


class DecisionEngine:
    def __init__(self, config: AutomationConfig, retry: RetryManager):
        self._config = config
        self._retry = retry

    def min_confidence_for(self, layer: str) -> float:
        return {
            "dom": self._config.min_confidence_dom,
            "ax": self._config.min_confidence_ax,
            "vision": self._config.min_confidence_vision,
            "input": self._config.min_confidence_input,
            "script": 0.5,
        }.get(layer, 0.5)

    def passes_confidence(self, layer: str, result: LayerExecutionResult) -> bool:
        if not result.success:
            return False
        return result.confidence >= self.min_confidence_for(layer)

    def build_chain(
        self,
        ctx: ExecutionContext,
        *,
        allow_dom: bool,
        allow_ax: bool,
        allow_vision: bool,
        allow_input: bool,
        allow_script: bool,
    ) -> list[str]:
        return self._retry.fallback_chain(
            browser_controlled=ctx.controlled_browser or bool(ctx.browser_session_id),
            allow_dom=allow_dom,
            allow_ax=allow_ax,
            allow_vision=allow_vision,
            allow_input=allow_input,
            allow_script=allow_script,
        )

    async def maybe_parallel_probe(
        self,
        ax_coro,
        vision_coro,
        *,
        enabled: bool,
    ) -> tuple[Optional[LayerExecutionResult], Optional[LayerExecutionResult]]:
        if not enabled:
            ax_r = await ax_coro()
            return ax_r, None
        try:
            ax_r, vis_r = await asyncio.wait_for(
                asyncio.gather(ax_coro(), vision_coro()),
                timeout=max(self._config.timeout_ax_s, self._config.timeout_vision_s),
            )
            return ax_r, vis_r
        except Exception:
            return None, None
