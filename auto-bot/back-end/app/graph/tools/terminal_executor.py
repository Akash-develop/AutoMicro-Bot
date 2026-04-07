import subprocess
import os
import re
import logging
import time
import signal
from pathlib import Path
from langchain_core.tools import tool
from app.graph.tools.permission_manager import check_permission, load_permissions

logger = logging.getLogger(__name__)

COMMAND_TIMEOUT = 60  # seconds

SAFETY_GUARD_PATTERNS = {
    "block_destructive_delete": [
        r"rm\s+-rf\s+/",
        r"rm\s+-rf\s+\*",
        r"rm\s+-rf\s+~",
        r"srm\s+",
    ],
    "block_disk_operations": [
        r"mkfs\b",
        r"\bwipefs\b",
        r"dd\s+if=",
        r">\s*/dev/sd[a-z]",
        r"diskutil\s+erase",
        r"diskutil\s+partitionDisk",
    ],
    "block_system_power": [
        r"\bshutdown\b",
        r"\breboot\b",
    ],
    "block_system_integrity": [
        r"\bcsrutil\s+disable\b",
        r"nvram\s+.*boot-args",
        r"launchctl\s+unload\s+/System",
        r"defaults\s+delete\s+/Library",
        r"defaults\s+delete\s+com\.apple",
    ],
    "block_remote_code_exec": [
        r"curl\s+.*\|\s*(ba)?sh",
        r"wget\s+.*\|\s*(ba)?sh",
    ],
    "block_permission_changes": [
        r"chmod\s+777\s+/",
        r"chmod\s+-R\s+777\s+/",
        r"chown\s+-R\s+.*\s+/\s*$",
    ],
    "block_fork_bomb": [
        r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;",
        r">\s*/dev/null\s+2>&1\s*&\s*disown",
    ],
}

_compiled_guards = {
    guard: [re.compile(p, re.IGNORECASE) for p in patterns]
    for guard, patterns in SAFETY_GUARD_PATTERNS.items()
}

GUARD_LABELS = {
    "block_destructive_delete": "Destructive Delete (rm -rf)",
    "block_disk_operations": "Disk Format / Write",
    "block_system_power": "System Power (shutdown/reboot)",
    "block_system_integrity": "System Integrity (SIP/nvram)",
    "block_remote_code_exec": "Remote Code Execution (curl|sh)",
    "block_permission_changes": "Permission Changes (chmod/chown)",
    "block_fork_bomb": "Fork Bomb / Background Disown",
}


def check_command_safety(command: str) -> str | None:
    """Returns a block reason string if the command matches an active guard, else None."""
    perms = load_permissions()
    for guard, patterns in _compiled_guards.items():
        if not perms.get(guard, True):
            continue
        for pattern in patterns:
            if pattern.search(command):
                label = GUARD_LABELS.get(guard, guard)
                return f"Blocked by safety guard: {label}. Disable it in Settings > Tool Permissions if needed."
    return None


@tool
@check_permission("execute_terminal_command")
def execute_terminal_command(command: str) -> str:
    """Executes a terminal command on macOS and returns the combined stdout+stderr output.
    Use this to run shell commands, scripts, or system utilities on the user's machine.
    The command runs in the user's home directory by default."""
    block_reason = check_command_safety(command)
    if block_reason:
        logger.warning(f"Blocked command: {command} — {block_reason}")
        return f"[exit_code: -1]\nError: {block_reason}"

    cwd = str(Path.home())
    start = time.monotonic()

    try:
        env = {**os.environ, "LANG": "en_US.UTF-8"}
        p = subprocess.Popen(
            command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=cwd,
            env=env,
            start_new_session=True,
        )

        try:
            stdout, _ = p.communicate(timeout=COMMAND_TIMEOUT)
        except subprocess.TimeoutExpired:
            # Best-effort: terminate the whole process group (shell + children).
            try:
                os.killpg(p.pid, signal.SIGTERM)
            except Exception:
                try:
                    p.terminate()
                except Exception:
                    pass

            try:
                stdout, _ = p.communicate(timeout=2)
            except Exception:
                stdout = ""

            try:
                os.killpg(p.pid, signal.SIGKILL)
            except Exception:
                try:
                    p.kill()
                except Exception:
                    pass

            try:
                p.communicate(timeout=2)
            except Exception:
                pass

            elapsed = round(time.monotonic() - start, 2)
            return (
                f"[exit_code: -1] [elapsed: {elapsed}s]\n"
                f"Error: Command timed out after {COMMAND_TIMEOUT}s and was killed."
            )

        elapsed = round(time.monotonic() - start, 2)
        output = stdout.strip() if stdout else ""
        if not output and p.returncode == 0:
            output = "(no output)"
        return f"[exit_code: {p.returncode}] [elapsed: {elapsed}s]\n{output}"
    except Exception as e:
        elapsed = round(time.monotonic() - start, 2)
        logger.error(f"Error executing command: {e}")
        return f"[exit_code: -1] [elapsed: {elapsed}s]\nError: {str(e)}"
