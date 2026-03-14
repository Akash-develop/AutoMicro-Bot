import json
import os
from functools import wraps

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

def load_permissions():
    """Load the current tool permissions from the JSON config."""
    perms = BUILTIN_TOOLS.copy()
    
    # Inject default custom rules
    perms["dont_do_user_saw_crash_my_os"] = True
    
    try:
        with open(CONFIG_PATH, "r") as f:
            saved = json.load(f)
            perms.update(saved)
    except FileNotFoundError:
        pass
    return perms

def save_permissions(permissions: dict):
    """Save updated permissions back to the JSON config."""
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(permissions, f, indent=4)

def check_permission(tool_name: str):
    """
    Parametrized decorator for LangChain tools.
    Checks if a tool is allowed to run based on the JSON config.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            permissions = load_permissions()
            is_allowed = permissions.get(tool_name, False)  # Default to False if not in config out of caution
            if not is_allowed:
                return f"I can't perform this action because permission is disabled in settings. (Tool: {tool_name})"
            return func(*args, **kwargs)
        return wrapper
    return decorator
