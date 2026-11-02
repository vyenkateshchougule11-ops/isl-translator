"""Start the ISL Translator and open the dashboard once the server is ready."""
import socket
import sys
import threading
import time
import webbrowser

import uvicorn

from backend import config


def open_when_ready(url: str):
    """Model loading takes a few seconds, so wait until the server accepts connections."""
    for _ in range(120):
        try:
            with socket.create_connection((config.HOST, config.PORT), timeout=1):
                break
        except OSError:
            time.sleep(1)
    webbrowser.open(url)


if __name__ == "__main__":
    missing = [p.name for p in (config.MODEL_PATH, config.METADATA_PATH) if not p.exists()]
    if missing:
        sys.exit("Trained model not found. Put these file(s) in the 'models' folder: " + ", ".join(missing))

    threading.Thread(target=open_when_ready, args=(f"http://{config.HOST}:{config.PORT}",), daemon=True).start()
    uvicorn.run("backend.main:app", host=config.HOST, port=config.PORT)
