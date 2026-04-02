"""Desktop automation orchestration: decision engine, IPC, controllers, audit."""

from app.automation.orchestrator import run_automation, AutomationOrchestrator

__all__ = ["run_automation", "AutomationOrchestrator"]
