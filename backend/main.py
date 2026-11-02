
"""FastAPI app: dashboard, camera + sentence control, and the read-only shared live view."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .pipeline import CameraTranslator
from .predictor import ModelStore
from .share import ShareManager

store = ModelStore()
translator = CameraTranslator(store)
share = ShareManager()

# The only things people coming through the public tunnel may reach
PUBLIC_PREFIXES = ("/watch/", "/share/", "/static/")
PUBLIC_STATE_KEYS = ("running", "label", "confidence", "words", "sentences", "word_seq", "recent_words")


@asynccontextmanager
async def lifespan(app: FastAPI):
    store.load()          # raises a clear error if the model is missing or mismatched
    yield
    translator.stop()
    share.stop()


app = FastAPI(title="ISL Translator", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=config.FRONTEND_DIR), name="static")


def _is_local(request: Request) -> bool:
    """True only for the person sitting at this laptop (tunnel traffic carries proxy headers)."""
    host = request.client.host if request.client else ""
    via_proxy = "cf-connecting-ip" in request.headers or "x-forwarded-for" in request.headers
    return host in ("127.0.0.1", "::1") and not via_proxy


@app.middleware("http")
async def protect_owner_routes(request: Request, call_next):
    if not _is_local(request) and not request.url.path.startswith(PUBLIC_PREFIXES):
        return JSONResponse({"detail": "Not found"}, status_code=404)
    return await call_next(request)


# ---------------- owner dashboard ----------------
@app.get("/")
def index():
    return FileResponse(config.FRONTEND_DIR / "index.html")


@app.get("/api/status")
def status():
    return store.info()


@app.get("/api/state")
def state():
    return translator.get_state()


@app.post("/api/start")
def start():
    try:
        translator.start()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {"ok": True}


@app.post("/api/stop")
def stop():
    translator.stop()
    return {"ok": True}


@app.post("/api/sentence/complete")
def complete_sentence():
    return {"text": translator.complete_sentence()}


@app.post("/api/sentence/undo")
def undo_word():
    return {"removed": translator.undo_word()}


@app.delete("/api/sentence/word/{index}")
def remove_word(index: int):
    return {"removed": translator.remove_word_at(index)}


@app.post("/api/sentence/move")
def move_word(src: int, to: int):
    return {"ok": translator.move_word(src, to)}


@app.post("/api/sentence/clear")
def clear_sentence():
    translator.clear_sentence()
    return {"ok": True}


@app.post("/api/history/clear")
def clear_history():
    translator.clear_history()
    return {"ok": True}


@app.get("/video_feed")
async def video_feed():
    return StreamingResponse(translator.mjpeg(), media_type="multipart/x-mixed-replace; boundary=frame")


# ---------------- share controls (owner only) ----------------
@app.get("/api/share")
def share_info():
    return share.info()


@app.post("/api/share/start")
def share_start():
    try:
        return share.start()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.post("/api/share/stop")
def share_stop():
    share.stop()
    return {"active": False}


# ---------------- shared live view (read only, secret token) ----------------
@app.get("/watch/{token}")
def watch_page(token: str):
    if not share.valid(token):
        return HTMLResponse("<h2 style='font-family:sans-serif;padding:40px'>This live link has ended or is not valid.</h2>",
                            status_code=404)
    return FileResponse(config.FRONTEND_DIR / "viewer.html")


@app.get("/share/{token}/state")
def share_state(token: str, v: str = ""):
    if not share.valid(token):
        raise HTTPException(status_code=404, detail="Not found")
    share.touch(v[:32] or "viewer")
    s = translator.get_state()
    return {"idle_label": store.idle_label, **{k: s[k] for k in PUBLIC_STATE_KEYS}}


@app.get("/share/{token}/frame.jpg")
def share_frame(token: str):
    if not share.valid(token):
        raise HTTPException(status_code=404, detail="Not found")
    jpeg = translator.latest_jpeg()
    if jpeg is None:
        return Response(status_code=204)
    return Response(jpeg, media_type="image/jpeg", headers={"Cache-Control": "no-store"})