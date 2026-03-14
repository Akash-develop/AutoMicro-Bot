import os
import subprocess
import platform
from langchain_core.tools import tool
from app.graph.tools.permission_manager import check_permission

@tool
@check_permission("sleep_system")
def sleep_system() -> str:
    """Puts the computer to sleep. Supports macOS and Windows."""
    system = platform.system()
    try:
        if system == "Darwin":
            subprocess.run(["pmset", "sleepnow"], check=True)
            return "System is going to sleep."
        elif system == "Windows":
            os.system("rundll32.exe powrprof.dll,SetSuspendState 0,1,0")
            return "System is going to sleep."
        elif system == "Linux":
            os.system("systemctl suspend")
            return "System is going to sleep."
        else:
            return f"Sleep command not supported on {system}."
    except Exception as e:
        return f"Failed to put system to sleep: {str(e)}"
