"""Ties resolver, security, decision engine, controllers, audit, plugins."""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Callable, Optional

from app.automation.action_resolver import ActionResolver
from app.automation.audit import AutomationAuditLog
from app.automation.config import AutomationConfig
from app.automation.decision_engine import DecisionEngine, ExecutionContext
from app.automation.feedback import FeedbackValidator
from app.automation.models import LayerExecutionResult, ResolvedTarget, StructuredAction
from app.automation.observer import Observer
from app.automation.plugins import load_plugins
from app.automation.retry_manager import RetryManager
from app.automation.schema_validation import validate_execution_result
from app.automation.security import DEFAULT_BLOCKLIST_BUNDLE_IDS, SecurityPolicy
from app.automation.state_engine import StateEngine
from app.automation.supervisor import ProcessSupervisor
from app.automation.vision_controller import VisionController, capture_screen_to_temp
from app.automation.events import EventCoordinator

logger = logging.getLogger(__name__)

ProgressCb = Optional[Callable[[str, dict[str, Any]], None]]


def _as_result(raw: Any) -> LayerExecutionResult:
    if isinstance(raw, dict):
        validate_execution_result(raw)
        return LayerExecutionResult.model_validate(raw)
    raise ValueError("invalid result")


class AutomationOrchestrator:
    def __init__(
        self,
        config: Optional[AutomationConfig] = None,
        permissions: Optional[dict[str, bool]] = None,
    ):
        self.config = config or AutomationConfig()
        self.permissions = permissions or {}
        self.supervisor = ProcessSupervisor(self.config)
        self.events = EventCoordinator(self.supervisor)
        self.observer = Observer(self.config, self.supervisor, self.events)
        self.retry = RetryManager(self.config)
        self.decision = DecisionEngine(self.config, self.retry)
        self.resolver = ActionResolver()
        self.feedback = FeedbackValidator()
        self.vision = VisionController(
            self.config.vision_llm_endpoint, self.config.vision_llm_api_key
        )
        self.plugins = load_plugins()
        sec_allow = [x for x in (os.getenv("AUTOMATION_ALLOWLIST_BUNDLES") or "").split(",") if x]
        sec_extra_block = [x for x in (os.getenv("AUTOMATION_BLOCKLIST_BUNDLES") or "").split(",") if x]
        block_merged = list(
            dict.fromkeys(
                list(DEFAULT_BLOCKLIST_BUNDLE_IDS)
                + self.config.blocklist_bundle_ids
                + sec_extra_block
            )
        )
        self.security = SecurityPolicy(
            allowlist_bundle_ids=sec_allow or self.config.allowlist_bundle_ids,
            blocklist_bundle_ids=block_merged,
            require_sensitive_confirmation=self.config.require_sensitive_confirmation,
        )

    def _allowed(self, key: str) -> bool:
        if not self.permissions.get("run_ui_automation", True):
            return False
        return bool(self.permissions.get(key, True))

    def _emit(self, cb: ProgressCb, phase: str, data: dict[str, Any]) -> None:
        if cb:
            cb(phase, data)

    def run(
        self,
        intent: str,
        *,
        session_id: Optional[str] = None,
        browser_session_id: Optional[str] = None,
        front_app_bundle: str = "",
        confirmed_sensitive: bool = False,
        ai_structured: Optional[dict[str, Any]] = None,
        progress: ProgressCb = None,
    ) -> str:
        audit = AutomationAuditLog(session_id=session_id)
        state = StateEngine()
        state.reset_run()

        if not self._allowed("run_ui_automation"):
            return "UI automation is disabled in settings (run_ui_automation)."

        try:
            if self.config.is_deterministic() or not ai_structured:
                action, resolved = self.resolver.resolve_intent(intent)
            else:
                action, resolved = self.resolver.structured_from_ai_target(**ai_structured)
        except Exception as e:
            audit.log_phase("resolve_error", result={"error": str(e)})
            return f"Could not parse automation intent: {e}"

        audit.log_phase(
            "resolved",
            context={"intent": intent},
            ai_decision=action.model_dump(),
            layer=None,
        )

        ok_b, reason = self.security.bundle_allowed(front_app_bundle)
        if not ok_b:
            audit.log_phase("blocked", result={"reason": reason})
            return f"Security policy: {reason}"

        ok_s, pending = self.security.sensitive_ok(action, confirmed_sensitive)
        if not ok_s:
            state.finalize_pending_confirmation()
            audit.log_phase("pending_confirmation", result={"reason": pending})
            return f"Sensitive action blocked: {pending}"

        for p in self.plugins:
            try:
                p.on_before_action({"intent": intent, "action": action.model_dump()})
            except Exception as ex:
                logger.debug("plugin before: %s", ex)

        ctx = ExecutionContext(
            browser_session_id=browser_session_id,
            front_app_bundle=front_app_bundle,
            controlled_browser=bool(browser_session_id),
        )
        chain = self.decision.build_chain(
            ctx,
            allow_dom=self._allowed("automation_layer_dom"),
            allow_ax=self._allowed("automation_layer_ax"),
            allow_vision=self._allowed("automation_layer_vision"),
            allow_input=self._allowed("automation_layer_input"),
            allow_script=self._allowed("automation_layer_script"),
        )
        if not chain:
            return "No automation layers are enabled in settings."

        state.set_running(f"{action.action}:{action.target.value}")
        obs_before = self.observer.observe(
            want_dom="dom" in chain,
            want_ax="ax" in chain,
            partial=True,
        )
        audit.log_phase(
            "observe_before",
            context={
                "partial": obs_before.partial,
                "has_dom": obs_before.dom_root is not None,
                "has_ax": obs_before.ax_root is not None,
            },
        )

        fp = self.retry.fingerprint(action, obs_before.front_app + obs_before.window_title)
        if self.retry.is_loop(fp):
            audit.log_phase("loop_detected", result={"fingerprint": fp})
            return "Loop detected: same action/state repeated; aborting."

        last_err = ""
        for attempt, layer in enumerate(chain):
            if self.retry.should_stop(attempt):
                break
            self.retry.cooldown_wait()
            self._emit(progress, "layer_try", {"layer": layer, "attempt": attempt})
            try:
                result = self._execute_layer(layer, action, resolved)
            except Exception as e:
                last_err = str(e)
                state.record_attempt(layer, f"error:{last_err}")
                audit.log_phase(
                    "layer_error",
                    layer=layer,
                    fallback=[a.model_dump() for a in state.snapshot.layerAttempts],
                    result={"error": last_err},
                )
                continue

            state.record_attempt(layer, "executed", confidence=result.confidence)
            audit.log_phase(
                "layer_result",
                layer=layer,
                fallback=[a.model_dump() for a in state.snapshot.layerAttempts],
                result=result.model_dump(),
            )

            if self.decision.passes_confidence(layer, result):
                obs_after = self.observer.refresh_after_action(obs_before, partial=True)
                ok_fb, why = self.feedback.validate(action, obs_before, obs_after)
                self._emit(progress, "feedback", {"ok": ok_fb, "detail": why})
                for p in self.plugins:
                    try:
                        p.on_after_action(
                            {"layer": layer},
                            result.model_dump(),
                        )
                    except Exception as ex:
                        logger.debug("plugin after: %s", ex)
                state.finalize_success()
                audit.log_phase(
                    "success",
                    layer=layer,
                    result=result.model_dump(),
                )
                audit.record_replay_step(attempt, {"layer": layer, "action": action.model_dump()})
                return json.dumps(
                    {
                        "status": "success",
                        "layer": layer,
                        "confidence": result.confidence,
                        "evidence": result.evidence,
                        "feedback": why,
                    },
                    indent=2,
                )

            last_err = result.error or "below confidence threshold"

        state.finalize_failed()
        audit.log_phase("failed", result={"last_error": last_err})
        return json.dumps({"status": "failed", "error": last_err}, indent=2)

    def _execute_layer(self, layer: str, action: StructuredAction, resolved: ResolvedTarget) -> LayerExecutionResult:
        if layer == "dom":
            return self._dom_exec(action, resolved)
        if layer == "ax":
            return self._swift_exec("axPerform", action, resolved)
        if layer == "vision":
            return self._vision_exec(action, resolved)
        if layer == "input":
            return self._swift_exec("cgPerform", action, resolved)
        if layer == "script":
            return self._script_exec(action, resolved)
        return LayerExecutionResult(
            success=False,
            confidence=0.0,
            method="unknown",
            layer="orchestrator",
            error=f"unknown layer {layer}",
            evidence={},
        )

    def _dom_exec(self, action: StructuredAction, resolved: ResolvedTarget) -> LayerExecutionResult:
        port = self.config.chrome_debug_port
        params: dict[str, Any] = {"port": port, "action": action.model_dump(), "resolved": resolved.model_dump()}
        raw = self.supervisor.request(
            "dom",
            "execute",
            params,
            timeout_s=self.config.timeout_dom_s,
            respawn_cmd=self._dom_cmd(),
        )
        return _as_result(raw)

    def _swift_exec(self, method: str, action: StructuredAction, resolved: ResolvedTarget) -> LayerExecutionResult:
        params = {"action": action.model_dump(), "resolved": resolved.model_dump()}
        raw = self.supervisor.request(
            "swift",
            method,
            params,
            timeout_s=self.config.timeout_ax_s,
            respawn_cmd=self._swift_cmd(),
        )
        return _as_result(raw)

    def _vision_exec(self, action: StructuredAction, resolved: ResolvedTarget) -> LayerExecutionResult:
        path = capture_screen_to_temp()
        try:
            q = resolved.label or action.target.value
            vr = self.vision.probe_for_action(path, text_query=q)
            if vr.success and action.action == "click":
                ev = vr.evidence
                if "x" in ev and "y" in ev:
                    cx = int(float(ev["x"])) + int(float(ev.get("w", 0))) // 2
                    cy = int(float(ev["y"])) + int(float(ev.get("h", 0))) // 2
                    raw = self.supervisor.request(
                        "swift",
                        "cgClick",
                        {"x": cx, "y": cy},
                        timeout_s=self.config.timeout_input_s,
                        respawn_cmd=self._swift_cmd(),
                    )
                    click_res = _as_result(raw)
                    merged = vr.model_dump()
                    merged["evidence"] = {**merged.get("evidence", {}), "click": click_res.model_dump()}
                    if click_res.success:
                        return LayerExecutionResult(
                            success=True,
                            confidence=min(vr.confidence, click_res.confidence),
                            method="Vision+Input",
                            layer="vision",
                            error=None,
                            evidence=merged["evidence"],
                        )
            return vr
        finally:
            try:
                os.remove(path)
            except OSError:
                pass

    def _script_exec(self, action: StructuredAction, resolved: ResolvedTarget) -> LayerExecutionResult:
        # Vetted high-level only — no arbitrary shell from this layer
        label = resolved.label or action.target.value
        script = f'tell application "System Events" to return name of first application process whose frontmost is true'
        import subprocess

        try:
            out = subprocess.run(
                ["/usr/bin/osascript", "-e", script],
                capture_output=True,
                text=True,
                timeout=self.config.timeout_script_s,
            )
            front = (out.stdout or "").strip()
            return LayerExecutionResult(
                success=True,
                confidence=0.55,
                method="AppleScript",
                layer="script",
                error=None if out.returncode == 0 else out.stderr,
                evidence={"front_app": front, "target": label},
            )
        except Exception as e:
            return LayerExecutionResult(
                success=False,
                confidence=0.0,
                method="AppleScript",
                layer="script",
                error=str(e),
                evidence={},
            )

    def _dom_cmd(self) -> tuple[list[str], Optional[str]]:
        root = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        dom_dir = os.path.join(root, "automation-dom")
        entry = os.path.join(dom_dir, "src", "server.ts")
        js = os.path.join(dom_dir, "dist", "server.js")
        tsx_bin = os.path.join(dom_dir, "node_modules", ".bin", "tsx")
        if os.path.isfile(entry) and os.path.isfile(tsx_bin):
            return [tsx_bin, entry], dom_dir
        if os.path.isfile(entry):
            return ["npx", "--yes", "tsx", entry], dom_dir
        return ["node", js], dom_dir

    def _swift_cmd(self) -> tuple[list[str], Optional[str]]:
        root = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        pkg = os.path.join(root, "native", "AutomationHelper")
        bin_path = os.path.join(
            pkg, ".build", "release", "AutomationHelper"
        )
        if os.path.isfile(bin_path):
            return [bin_path], pkg
        return ["swift", "run", "--package-path", pkg, "AutomationHelper"], pkg

    def ensure_children(self) -> None:
        if self._allowed("automation_layer_dom"):
            try:
                self.supervisor.start_node_dom(self._dom_cmd()[0], self._dom_cmd()[1])
            except Exception as e:
                logger.warning("DOM service not started: %s", e)
        if self._allowed("automation_layer_ax") or self._allowed("automation_layer_input"):
            try:
                self.supervisor.start_swift_helper(self._swift_cmd()[0], self._swift_cmd()[1])
            except Exception as e:
                logger.warning("Swift helper not started: %s", e)


def run_automation(
    intent: str,
    *,
    permissions: Optional[dict[str, bool]] = None,
    **kwargs: Any,
) -> str:
    orch = AutomationOrchestrator(permissions=permissions)
    orch.ensure_children()
    return orch.run(intent, **kwargs)
