"""Retry policy, fallback ordering, loop detection, cooldown."""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Iterable, Optional

from app.automation.config import AutomationConfig
from app.automation.models import StructuredAction


@dataclass
class RetryManager:
    config: AutomationConfig
    _loop_hashes: dict[str, float] = field(default_factory=dict)
    _failure_times: list[float] = field(default_factory=list)
    cooldown_s: float = 0.35

    def fingerprint(self, action: StructuredAction, state_hint: str) -> str:
        key = json.dumps(
            {
                "a": action.action,
                "t": action.target.model_dump(),
                "s": state_hint,
            },
            sort_keys=True,
        )
        return hashlib.sha256(key.encode()).hexdigest()[:24]

    def is_loop(self, fp: str) -> bool:
        now = time.time()
        last = self._loop_hashes.get(fp)
        if last is not None and now - last < 2.0:
            return True
        self._loop_hashes[fp] = now
        # prune old
        self._loop_hashes = {k: v for k, v in self._loop_hashes.items() if now - v < 30}
        return False

    def cooldown_wait(self) -> None:
        if self._failure_times:
            elapsed = time.time() - self._failure_times[-1]
            if elapsed < self.cooldown_s:
                time.sleep(self.cooldown_s - elapsed)
        self._failure_times.append(time.time())
        self._failure_times = self._failure_times[-16:]

    def should_stop(self, attempt_index: int) -> bool:
        return attempt_index >= self.config.max_retries

    def fallback_chain(
        self,
        *,
        browser_controlled: bool,
        allow_dom: bool,
        allow_ax: bool,
        allow_vision: bool,
        allow_input: bool,
        allow_script: bool,
    ) -> list[str]:
        chain: list[str] = []
        if browser_controlled and allow_dom:
            chain.append("dom")
        if allow_ax:
            chain.append("ax")
        if allow_vision:
            chain.append("vision")
        if allow_script:
            chain.append("script")
        if allow_input:
            chain.append("input")
        # de-dupe preserving order
        seen: set[str] = set()
        out: list[str] = []
        for x in chain:
            if x not in seen:
                seen.add(x)
                out.append(x)
        return out

    def merge_parallel_candidates(self, layers: Iterable[str]) -> list[str]:
        return list(dict.fromkeys(layers))
