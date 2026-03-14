import subprocess
from langchain_core.tools import tool
from app.graph.tools.permission_manager import check_permission

@tool
@check_permission("execute_terminal_command")
def execute_terminal_command(command: str) -> str:
    """Executes a command in the terminal and returns the output."""
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
