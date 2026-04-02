"""Plugin interface and dynamic loading from auto-bot/plugins."""

from __future__ import annotations

import importlib.util
import logging
import os
from typing import Any, Optional, Protocol

logger = logging.getLogger(__name__)


class AutomationPlugin(Protocol):
    name: str

    def on_before_action(self, context: dict[str, Any]) -> None: ...

    def on_after_action(self, context: dict[str, Any], result: dict[str, Any]) -> None: ...


def _plugins_root() -> str:
    return os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "plugins")
    )


def load_plugins(extra_dir: Optional[str] = None) -> list[Any]:
    """Load python modules from plugins/, plugins/app-specific/, plugins/custom-actions/."""
    roots = [_plugins_root()]
    if extra_dir:
        roots.append(extra_dir)
    instances: list[Any] = []
    for base in roots:
        if not os.path.isdir(base):
            continue
        for sub in ("", "app-specific", "custom-actions"):
            d = os.path.join(base, sub) if sub else base
            if not os.path.isdir(d):
                continue
            for name in os.listdir(d):
                if not name.endswith(".py") or name.startswith("_"):
                    continue
                path = os.path.join(d, name)
                mod_name = f"automicro_plugin_{name[:-3]}"
                try:
                    spec = importlib.util.spec_from_file_location(mod_name, path)
                    if not spec or not spec.loader:
                        continue
                    mod = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(mod)
                    plugin = getattr(mod, "plugin", None)
                    if plugin is not None:
                        instances.append(plugin)
                        logger.info("Loaded automation plugin from %s", path)
                except Exception as e:
                    logger.warning("Failed to load plugin %s: %s", path, e)
    return instances
