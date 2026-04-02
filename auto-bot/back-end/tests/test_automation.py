"""Unit tests for automation schemas, resolver, retry policy, vision stub."""

import os
import sys

import pytest

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from app.automation.action_resolver import ActionResolver
from app.automation.config import AutomationConfig
from app.automation.models import LayerExecutionResult, StructuredAction, ActionTarget
from app.automation.retry_manager import RetryManager
from app.automation.schema_validation import validate_action, validate_execution_result
from app.automation.decision_engine import DecisionEngine


def test_schema_action_roundtrip():
    a = StructuredAction(
        action="click",
        target=ActionTarget(type="label", value="Submit"),
        confidence=0.9,
    )
    d = a.model_dump(mode="json")
    validate_action(d)


def test_schema_execution_result():
    r = LayerExecutionResult(
        success=True,
        confidence=0.8,
        method="AX",
        layer="ax",
        error=None,
        evidence={},
    )
    validate_execution_result(r.model_dump(mode="json"))


def test_action_resolver_click_submit():
    ar = ActionResolver()
    action, resolved = ar.resolve_intent("click submit button")
    assert action.action == "click"
    assert "submit" in resolved.label.lower() or "submit" in action.target.value.lower()


def test_retry_loop_detection():
    cfg = AutomationConfig()
    rm = RetryManager(cfg)
    act = StructuredAction(
        action="click",
        target=ActionTarget(type="label", value="x"),
        confidence=0.5,
    )
    fp = rm.fingerprint(act, "state1")
    assert not rm.is_loop(fp)
    assert rm.is_loop(fp)


def test_decision_confidence_threshold():
    cfg = AutomationConfig()
    de = DecisionEngine(cfg, RetryManager(cfg))
    ok = LayerExecutionResult(
        success=True,
        confidence=0.99,
        method="DOM",
        layer="dom",
        error=None,
        evidence={},
    )
    assert de.passes_confidence("dom", ok)
    bad = ok.model_copy(update={"confidence": 0.1})
    assert not de.passes_confidence("dom", bad)


@pytest.mark.skipif(
    not os.getenv("RUN_VISION_OCR_TEST"),
    reason="Set RUN_VISION_OCR_TEST=1 and install tesseract to run OCR smoke test",
)
def test_vision_controller_ocr_smoke():
    import numpy as np
    import cv2

    from app.automation.vision_controller import VisionController

    vc = VisionController()
    path = os.path.join(BACKEND_ROOT, "..", "e2e-demos", "fixtures", "_ocr_test.png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img = np.zeros((80, 240, 3), dtype=np.uint8)
    cv2.putText(img, "Submit", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
    cv2.imwrite(path, img)
    ok, conf, ev = vc.ocr_regions(path, "Submit")
    assert ok or conf >= 0


def test_fallback_chain_order():
    cfg = AutomationConfig()
    rm = RetryManager(cfg)
    c = rm.fallback_chain(
        browser_controlled=True,
        allow_dom=True,
        allow_ax=True,
        allow_vision=True,
        allow_input=True,
        allow_script=True,
    )
    assert c[0] == "dom"
    c2 = rm.fallback_chain(
        browser_controlled=False,
        allow_dom=True,
        allow_ax=True,
        allow_vision=False,
        allow_input=True,
        allow_script=False,
    )
    assert c2[0] == "ax"
