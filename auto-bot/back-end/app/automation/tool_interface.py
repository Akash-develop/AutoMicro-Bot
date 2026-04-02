"""LangChain-agnostic tool contract. LangGraph registers LangChain tools separately."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class AutomationToolSpec:
    name: str
    description: str
    handler: Callable[..., str]


def run_spec(spec: AutomationToolSpec, **kwargs: Any) -> str:
    return spec.handler(**kwargs)
