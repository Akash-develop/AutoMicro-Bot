"""Process supervisor: spawn child services, health checks, restart on crash, timeouts."""

from __future__ import annotations

import logging
import os
import subprocess
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from app.automation.config import AutomationConfig
from app.automation.ipc import build_request, decode_line, encode_line, parse_result_payload

logger = logging.getLogger(__name__)


@dataclass
class SupervisedProcess:
    name: str
    popen: subprocess.Popen
    restart_count: int = 0
    last_health_ok: float = field(default_factory=time.time)
    last_io_ok: float = field(default_factory=time.time)


class ProcessSupervisor:
    def __init__(self, config: AutomationConfig):
        self._config = config
        self._lock = threading.Lock()
        self._children: dict[str, SupervisedProcess] = {}

    def start_node_dom(self, cmd: list[str], cwd: Optional[str] = None) -> None:
        self._spawn_locked("dom", cmd, cwd)

    def start_swift_helper(self, cmd: list[str], cwd: Optional[str] = None) -> None:
        self._spawn_locked("swift", cmd, cwd)

    def _spawn_locked(self, name: str, cmd: list[str], cwd: Optional[str]) -> None:
        with self._lock:
            self._stop_unlocked(name)
            logger.info("Supervisor starting %s: %s", name, cmd)
            proc = subprocess.Popen(
                cmd,
                cwd=cwd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
            )
            self._children[name] = SupervisedProcess(name=name, popen=proc)

    def stop(self, name: Optional[str] = None) -> None:
        with self._lock:
            if name:
                self._stop_unlocked(name)
            else:
                for n in list(self._children.keys()):
                    self._stop_unlocked(n)

    def _stop_unlocked(self, name: str) -> None:
        sp = self._children.pop(name, None)
        if not sp:
            return
        p = sp.popen
        if p.poll() is None:
            p.terminate()
            try:
                p.wait(timeout=2)
            except subprocess.TimeoutExpired:
                p.kill()
        for stream in (p.stdin, p.stdout, p.stderr):
            if stream:
                try:
                    stream.close()
                except Exception:
                    pass

    def request(
        self,
        name: str,
        method: str,
        params: Optional[dict[str, Any]] = None,
        timeout_s: Optional[float] = None,
        respawn_cmd: Optional[tuple[list[str], Optional[str]]] = None,
    ) -> Any:
        timeout_s = timeout_s or self._config.timeout_dom_s
        with self._lock:
            sp = self._children.get(name)
            if not sp or sp.popen.poll() is not None:
                if respawn_cmd:
                    self._spawn_locked(name, respawn_cmd[0], respawn_cmd[1])
                    sp = self._children.get(name)
                if not sp or sp.popen.poll() is not None:
                    raise RuntimeError(f"Supervisor: process {name} is not running")

        proc = sp.popen
        if not proc.stdin or not proc.stdout:
            raise RuntimeError(f"Supervisor: {name} missing stdio pipes")

        req = build_request(method, params)
        line = encode_line(req)
        proc.stdin.write(line)
        proc.stdin.flush()

        start = time.time()
        while True:
            if time.time() - start > timeout_s:
                raise TimeoutError(f"Supervisor: {name}.{method} timed out after {timeout_s}s")
            if proc.poll() is not None:
                if respawn_cmd and sp.restart_count < self._config.supervisor_restart_max:
                    sp.restart_count += 1
                    logger.warning("Supervisor restarting %s (crash), attempt %s", name, sp.restart_count)
                    self._spawn_locked(name, respawn_cmd[0], respawn_cmd[1])
                    return self.request(name, method, params, timeout_s, respawn_cmd=None)
                raise RuntimeError(f"Supervisor: child {name} exited during request")

            if proc.stdout.readable():
                proc.stdout.flush()
            # blocking readline with alarm is non-trivial cross-platform; use short poll
            import select

            r, _, _ = select.select([proc.stdout], [], [], 0.2)
            if r:
                out_line = proc.stdout.readline()
                if not out_line:
                    continue
                try:
                    resp = decode_line(out_line)
                except Exception as e:
                    logger.error("Supervisor bad JSON from %s: %s", name, e)
                    continue
                if resp.get("id") == req["id"] and resp.get("kind") == "response":
                    sp.last_io_ok = time.time()
                    return parse_result_payload(resp)
            time.sleep(0.01)

    def health(self, name: str, timeout_s: float = 1.0) -> bool:
        try:
            self.request(name, "health", {}, timeout_s=timeout_s)
            with self._lock:
                if name in self._children:
                    self._children[name].last_health_ok = time.time()
            return True
        except Exception as e:
            logger.warning("Health check failed for %s: %s", name, e)
            return False

    def tick_unresponsive(self, on_unresponsive: Optional[Callable[[str], None]] = None) -> None:
        now = time.time()
        with self._lock:
            for name, sp in list(self._children.items()):
                if sp.popen.poll() is not None:
                    continue
                if now - sp.last_io_ok > self._config.unresponsive_after_s:
                    if on_unresponsive:
                        on_unresponsive(name)
                    logger.error("Supervisor: %s appears unresponsive; terminating", name)
                    self._stop_unlocked(name)
