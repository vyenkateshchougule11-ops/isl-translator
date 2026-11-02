"""Live-view sharing: starts a free Cloudflare Quick Tunnel and manages the secret viewer token."""
import os
import re
import secrets
import shutil
import subprocess
import threading
import time

from . import config

URL_RE = re.compile(r"https://([a-z0-9-]+)\.trycloudflare\.com")
INSTALL_HINT = ("cloudflared was not found. Install it with:  winget install --id Cloudflare.cloudflared  "
                "(then open a NEW terminal), or put cloudflared.exe in the project's 'tools' folder.")


class ShareManager:
    def __init__(self):
        self._ctl = threading.Lock()         # start / stop
        self._view_lock = threading.Lock()   # viewer bookkeeping
        self._proc = None
        self._token = None
        self._base_url = None
        self._viewers = {}                   # viewer id -> last seen time

    # ---------- state ----------
    @property
    def active(self) -> bool:
        return self._proc is not None and self._proc.poll() is None and self._token is not None

    def info(self) -> dict:
        if not self.active:
            return {"active": False, "link": None, "viewers": 0}
        return {"active": True, "link": f"{self._base_url}/watch/{self._token}", "viewers": self.viewer_count()}

    def valid(self, token: str) -> bool:
        return self.active and secrets.compare_digest(token.encode(), self._token.encode())

    def touch(self, viewer_id: str):
        with self._view_lock:
            self._viewers[viewer_id] = time.time()

    def viewer_count(self) -> int:
        now = time.time()
        with self._view_lock:
            for k in [k for k, t in self._viewers.items() if now - t > 6]:
                del self._viewers[k]
            return len(self._viewers)

    # ---------- tunnel control ----------
    def start(self) -> dict:
        with self._ctl:
            if self.active:
                return self.info()

            exe = shutil.which("cloudflared")
            local = config.BASE_DIR / "tools" / "cloudflared.exe"
            if not exe and local.exists():
                exe = str(local)
            if not exe:
                raise RuntimeError(INSTALL_HINT)

            proc = subprocess.Popen(
                [exe, "tunnel", "--no-autoupdate", "--url", f"http://{config.HOST}:{config.PORT}"],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace",
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )

            found = {}
            ready = threading.Event()

            def reader():
                for line in proc.stdout:            # keeps draining so the pipe never blocks
                    if "url" not in found:
                        for m in URL_RE.finditer(line):
                            if m.group(1) != "api":
                                found["url"] = m.group(0)
                                break
                    if "url" in found and "Registered tunnel connection" in line:
                        ready.set()
                ready.set()                          # process ended

            threading.Thread(target=reader, daemon=True).start()
            ready.wait(timeout=40)

            if "url" not in found or proc.poll() is not None:
                proc.terminate()
                raise RuntimeError("Could not create the public link. Check your internet connection and try again.")

            self._proc = proc
            self._base_url = found["url"]
            self._token = secrets.token_urlsafe(9)
            with self._view_lock:
                self._viewers = {}
            return self.info()

    def stop(self):
        with self._ctl:
            proc, self._proc = self._proc, None
            self._token = None
            self._base_url = None
            if proc and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()