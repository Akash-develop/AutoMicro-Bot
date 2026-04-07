import json
import os
import logging
from functools import wraps

logger = logging.getLogger(__name__)

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "tool_permissions.json")

BUILTIN_TOOLS = {
    "execute_terminal_command": True,
}

SAFETY_GUARDS = {
    "block_destructive_delete": True,
    "block_disk_operations": True,
    "block_system_power": True,
    "block_system_integrity": True,
    "block_remote_code_exec": True,
    "block_permission_changes": True,
    "block_fork_bomb": True,
}

ALL_BUILTIN_KEYS = set(BUILTIN_TOOLS) | set(SAFETY_GUARDS)

# Dropped when loading/saving so old configs do not flood custom rules / UI.
DEPRECATED_TOOL_KEYS = frozenset(
    {
        "open_url",
        "search_web",
        "sleep_system",
        "create_folder",
        "create_file",
        "create_excel_with_sample_data",
        "save_long_term_memory",
        "run_ui_automation",
        "automation_layer_dom",
        "automation_layer_ax",
        "automation_layer_vision",
        "automation_layer_input",
        "automation_layer_script",
        "mouse_click",
        "mouse_move",
        "type_text",
        "key_press",
        "take_screenshot",
        "get_desktop_state",
        "control_app",
        "keyboard_type",
        "move_mouse",
        "scroll_mouse",
        "drag_mouse",
        "press_keys",
        "scrape_web",
        "wait",
        "get_screen_size",
        "get_active_tab_details",
        "get_tab_content",
        "run_browser_js",
    }
)

_permissions_cache = None


def _sanitize_permissions(raw: dict) -> dict:
    """Merge file data with defaults; drop deprecated tool keys; keep custom rules."""
    out = {**BUILTIN_TOOLS, **SAFETY_GUARDS}
    saved = {k: v for k, v in raw.items() if k not in DEPRECATED_TOOL_KEYS}
    locked = saved.pop("_locked_tools", None)

    for key, val in saved.items():
        out[key] = bool(val)

    if locked is not None and isinstance(locked, list):
        out["_locked_tools"] = [t for t in locked if t not in DEPRECATED_TOOL_KEYS]

    return out


def load_permissions(force_refresh=False):
    """Load the current tool permissions from the JSON config with caching."""
    global _permissions_cache

    if _permissions_cache is not None and not force_refresh:
        return _permissions_cache

    perms = {**BUILTIN_TOOLS, **SAFETY_GUARDS}

    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, "r") as f:
                saved = json.load(f)
                perms = _sanitize_permissions(saved)
    except Exception as e:
        logger.error(f"Error loading permissions from {CONFIG_PATH}: {e}")

    _permissions_cache = perms
    return perms


def refresh_permissions():
    """Manually invalidate the permission cache."""
    return load_permissions(force_refresh=True)


def save_permissions(permissions: dict):
    """Save updated permissions back to the JSON config and update cache."""
    global _permissions_cache
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    try:
        cleaned = _sanitize_permissions(permissions)
        with open(CONFIG_PATH, "w") as f:
            json.dump(cleaned, f, indent=4)
        _permissions_cache = cleaned
    except Exception as e:
        logger.error(f"Error saving permissions to {CONFIG_PATH}: {e}")


def check_permission(tool_name: str):
    """
    Parametrized decorator for LangChain tools.
    Checks if a tool is allowed to run based on the cached config.
    """

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            permissions = load_permissions()
            is_allowed = permissions.get(tool_name, False)
            if not is_allowed:
                return f"I can't perform this action because permission is disabled in settings. (Tool: {tool_name})"
            return func(*args, **kwargs)

        return wrapper

    return decorator
