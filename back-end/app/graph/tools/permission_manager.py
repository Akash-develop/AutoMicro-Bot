import json
import os
import logging
from functools import wraps

logger = logging.getLogger(__name__)

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "tool_permissions.json")

BUILTIN_TOOLS = {
    "execute_terminal_command": True,
    "open_url": True,
    "search_web": True,
    "sleep_system": True,
    "create_folder": True,
    "create_file": True,
    "create_excel_with_sample_data": True
}

# In-memory cache for permissions
_permissions_cache = None

def load_permissions(force_refresh=False):
    """Load the current tool permissions from the JSON config with caching."""
    global _permissions_cache
    
    if _permissions_cache is not None and not force_refresh:
        return _permissions_cache

    perms = BUILTIN_TOOLS.copy()
    
    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, "r") as f:
                saved = json.load(f)
                perms.update(saved)
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
        with open(CONFIG_PATH, "w") as f:
            json.dump(permissions, f, indent=4)
        _permissions_cache = permissions
    except Exception as e:
        logger.error(f"Error saving permissions: {e}")

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
