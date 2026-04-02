"""Deterministic resolver: human-readable intent -> structured targets for DOM/AX."""

from __future__ import annotations

import re
from typing import Optional

from app.automation.constants import AUTOMATION_SCHEMA_VERSION
from app.automation.models import ResolvedTarget, StructuredAction, ActionTarget


_ROLE_ALIASES = {
    "button": "AXButton",
    "btn": "AXButton",
    "link": "AXLink",
    "textfield": "AXTextField",
    "text field": "AXTextField",
    "checkbox": "AXCheckBox",
    "menu": "AXMenuItem",
    "tab": "AXRadioButton",
}

_DOM_TAGS = {
    "button": "button",
    "submit": "button",
    "link": "a",
}


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def _tokens(s: str) -> list[str]:
    return [t for t in re.split(r"[^\w]+", _norm(s)) if t]


class ActionResolver:
    """
    Converts phrases like 'click submit button' into:
    - StructuredAction (for the orchestrator)
    - ResolvedTarget (role_hint, label, ax_role, selector_hint)
    """

    _CLICK = re.compile(
        r"^(?P<verb>click|press|tap)\s+(?:the\s+)?(?P<label>.+?)(?:\s+button)?$",
        re.I,
    )
    _TYPE = re.compile(
        r"^(?:type|enter)\s+['\"](?P<text>[^'\"]+)['\"]\s+(?:into|in)\s+(?P<label>.+)$",
        re.I,
    )
    _SCROLL = re.compile(r"^scroll\s+(?P<dir>up|down|left|right)(?:\s+by\s+(?P<n>\d+))?$", re.I)

    def resolve_intent(self, intent: str) -> tuple[StructuredAction, ResolvedTarget]:
        raw = intent.strip()
        if not raw:
            raise ValueError("empty intent")

        rt = ResolvedTarget(schema_version=AUTOMATION_SCHEMA_VERSION, text_tokens=_tokens(raw))

        lower = _norm(raw)
        if m := self._SCROLL.match(lower):
            direction = m.group("dir")
            action = StructuredAction(
                action="scroll",
                target=ActionTarget(type="text", value=direction),
                confidence=0.95,
                payload={"delta": int(m.group("n") or "240")},
            )
            return action, rt

        if m := self._TYPE.match(raw.strip()):
            text = m.group("text")
            label = m.group("label").strip()
            self._apply_label_hints(label, rt)
            action = StructuredAction(
                action="type",
                target=ActionTarget(type="label", value=label),
                confidence=0.9,
                payload={"text": text},
            )
            return action, rt

        verb_label = raw
        if m := self._CLICK.match(raw.strip()):
            verb_label = m.group("label").strip()

        self._apply_label_hints(verb_label, rt)
        action = StructuredAction(
            action="click",
            target=ActionTarget(type="label", value=rt.label or verb_label),
            confidence=0.88,
            payload={},
        )
        return action, rt

    def _apply_label_hints(self, phrase: str, rt: ResolvedTarget) -> None:
        low = _norm(phrase)
        rt.label = phrase.strip()
        for word, ax in _ROLE_ALIASES.items():
            if word in low:
                rt.ax_role = ax
                rt.role_hint = word
                break
        for word, tag in _DOM_TAGS.items():
            if word in low:
                rt.selector_hint = tag
                break
        if not rt.selector_hint and rt.label:
            safe = re.sub(r"[^\w\-]+", "", rt.label)[:40]
            if safe:
                rt.selector_hint = f"[data-automation-label='{safe}']"

    def structured_from_ai_target(
        self,
        *,
        action: str,
        role: Optional[str] = None,
        label: Optional[str] = None,
        selector: Optional[str] = None,
    ) -> tuple[StructuredAction, ResolvedTarget]:
        """Deterministic mapping when the LLM supplies explicit fields (ai-assisted mode)."""
        rt = ResolvedTarget(schema_version=AUTOMATION_SCHEMA_VERSION)
        if role:
            rt.ax_role = role if role.startswith("AX") else _ROLE_ALIASES.get(_norm(role), role)
        if label:
            rt.label = label
            rt.text_tokens = _tokens(label)
        if selector:
            rt.selector_hint = selector

        if selector:
            tgt = ActionTarget(type="selector", value=selector)
            conf = 0.92
        elif role and label:
            tgt = ActionTarget(type="role", value=f"{role}|{label}")
            conf = 0.9
        elif label:
            tgt = ActionTarget(type="label", value=label)
            conf = 0.85
        else:
            raise ValueError("need label, selector, or role+label")

        valid_actions = {"click", "type", "scroll", "focus", "press", "wait"}
        act = StructuredAction(
            action=action if action in valid_actions else "click",
            target=tgt,
            confidence=conf,
            payload={},
        )
        return act, rt
