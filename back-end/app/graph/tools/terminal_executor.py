import subprocess
import logging
from langchain_core.tools import tool
from app.graph.tools.permission_manager import check_permission

logger = logging.getLogger(__name__)

# Basic blacklist for high-risk commands
DANGEROUS_COMMANDS = [
    "rm -rf /", "rm -rf *", "mkfs", "dd if=", "shutdown", "reboot",
    ":(){ :|:& };:", # Fork bomb
    "> /dev/sda", "wipefs"
]

def is_command_safe(command: str) -> bool:
    """Checks if a command contains any blacklisted patterns."""
    cmd_lower = command.lower()
    for dangerous in DANGEROUS_COMMANDS:
        if dangerous in cmd_lower:
            return False
    return True

@tool
@check_permission("execute_terminal_command")
def execute_terminal_command(command: str) -> str:
    """Executes a command in the terminal and returns the output."""
    if not is_command_safe(command):
        logger.warning(f"Blocked high-risk command execution attempt: {command}")
        return "Error: This command is blocked for security reasons (contains high-risk patterns)."

    try:
        result = subprocess.run(
            command,
            shell=True,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        return result.stdout if result.stdout else "Command executed successfully with no output."
    except subprocess.CalledProcessError as e:
        return f"Error executing command: {e.stderr}"
    except Exception as e:
        return f"Unexpected error: {str(e)}"
