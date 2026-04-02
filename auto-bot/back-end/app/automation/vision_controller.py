"""Vision: OpenCV template match + Tesseract; optional OpenAI-compatible vision API."""

from __future__ import annotations

import base64
import logging
import os
import tempfile
from typing import Any, Optional

import httpx

from app.automation.constants import AUTOMATION_SCHEMA_VERSION
from app.automation.models import LayerExecutionResult

logger = logging.getLogger(__name__)


class VisionController:
    def __init__(self, llm_endpoint: str = "", llm_api_key: str = ""):
        self._llm_endpoint = llm_endpoint
        self._llm_api_key = llm_api_key

    def find_template(
        self, screenshot_path: str, template_path: str, threshold: float = 0.82
    ) -> tuple[bool, float, dict[str, Any]]:
        try:
            import cv2
            import numpy as np
        except ImportError:
            return False, 0.0, {"error": "opencv not installed"}

        screen = cv2.imread(screenshot_path)
        tpl = cv2.imread(template_path)
        if screen is None or tpl is None:
            return False, 0.0, {"error": "failed to load images"}
        res = cv2.matchTemplate(screen, tpl, cv2.TM_CCOEFF_NORMED)
        min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)
        h, w = tpl.shape[:2]
        if max_val >= threshold:
            x, y = max_loc
            return True, float(max_val), {"x": x, "y": y, "w": w, "h": h, "method": "template"}
        return False, float(max_val), {"x": max_loc[0], "y": max_loc[1], "w": w, "h": h}

    def ocr_regions(self, screenshot_path: str, query: str) -> tuple[bool, float, dict[str, Any]]:
        try:
            import cv2
            import pytesseract
            from pytesseract import Output
        except ImportError:
            return False, 0.0, {"error": "pytesseract or opencv not installed"}

        img = cv2.imread(screenshot_path)
        if img is None:
            return False, 0.0, {"error": "bad image"}
        data = pytesseract.image_to_data(img, output_type=Output.DICT)
        q = query.lower().strip()
        best_conf = 0.0
        best_box = None
        n = len(data["text"])
        for i in range(n):
            t = (data["text"][i] or "").strip()
            if not t:
                continue
            if q in t.lower() or t.lower() in q:
                try:
                    conf = float(data["conf"][i]) / 100.0
                except (TypeError, ValueError):
                    conf = 0.5
                x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
                if conf > best_conf:
                    best_conf = conf
                    best_box = {"x": x, "y": y, "w": w, "h": h, "text": t}
        if best_box:
            return True, max(best_conf, 0.55), {**best_box, "method": "tesseract"}
        return False, 0.0, {"method": "tesseract"}

    def llm_vision_boxes(
        self, screenshot_path: str, prompt: str
    ) -> tuple[bool, float, dict[str, Any]]:
        if not self._llm_endpoint:
            return False, 0.0, {"skipped": True}
        try:
            with open(screenshot_path, "rb") as f:
                b64 = base64.standard_b64encode(f.read()).decode("ascii")
        except OSError as e:
            return False, 0.0, {"error": str(e)}

        body = {
            "model": os.getenv("AUTOMATION_VISION_LLM_MODEL", "gpt-4o-mini"),
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{b64}"},
                        },
                    ],
                }
            ],
            "max_tokens": 400,
        }
        headers = {"Content-Type": "application/json"}
        if self._llm_api_key:
            headers["Authorization"] = f"Bearer {self._llm_api_key}"
        try:
            with httpx.Client(timeout=30.0) as client:
                r = client.post(self._llm_endpoint, json=body, headers=headers)
                r.raise_for_status()
                data = r.json()
            text = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )
            return True, 0.7, {"raw": text, "method": "llm_vision"}
        except Exception as e:
            logger.warning("LLM vision failed: %s", e)
            return False, 0.0, {"error": str(e)}

    def probe_for_action(
        self,
        screenshot_path: str,
        *,
        template_path: Optional[str] = None,
        text_query: Optional[str] = None,
        use_llm: bool = False,
        llm_prompt: str = "List UI element bounding boxes as JSON {boxes:[{x,y,w,h,label,confidence}]}",
    ) -> LayerExecutionResult:
        evidence: dict[str, Any] = {}
        if template_path:
            ok, conf, ev = self.find_template(screenshot_path, template_path)
            evidence.update(ev)
            return LayerExecutionResult(
                success=ok,
                confidence=conf,
                method="OpenCV",
                layer="vision",
                error=None if ok else "template below threshold",
                evidence=evidence,
            )
        if text_query:
            ok, conf, ev = self.ocr_regions(screenshot_path, text_query)
            evidence.update(ev)
            return LayerExecutionResult(
                success=ok,
                confidence=conf,
                method="Tesseract",
                layer="vision",
                error=None if ok else "ocr miss",
                evidence=evidence,
            )
        if use_llm:
            ok, conf, ev = self.llm_vision_boxes(screenshot_path, llm_prompt)
            return LayerExecutionResult(
                success=ok,
                confidence=conf,
                method="LLM",
                layer="vision",
                error=None if ok else str(ev.get("error", "llm miss")),
                evidence=ev,
            )
        return LayerExecutionResult(
            success=False,
            confidence=0.0,
            method="none",
            layer="vision",
            error="no vision mode selected",
            evidence={},
        )


def capture_screen_to_temp() -> str:
    fd, path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    rc = os.system(f"/usr/bin/screencapture -x {path}")
    if rc != 0:
        try:
            os.remove(path)
        except OSError:
            pass
        raise RuntimeError("screencapture failed (grant Screen Recording if needed)")
    return path
