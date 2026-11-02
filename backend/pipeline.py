
"""Backend camera loop. Same flow as the notebook's live_test():
VideoCapture -> flip -> Holistic -> extract_keypoints -> predict.
Nothing is resized or compressed before feature extraction."""
import asyncio
import threading
from collections import deque

import cv2

from . import config
from .features import extract_keypoints, mediapipe_detection, mp_holistic
from .overlay import draw_boxes, draw_landmarks
from .predictor import ModelStore, Predictor


def _open_camera():
    if config.CAMERA_BACKEND == "dshow":
        return cv2.VideoCapture(config.CAMERA_INDEX, cv2.CAP_DSHOW)
    return cv2.VideoCapture(config.CAMERA_INDEX)      # default, same as the notebook


class CameraTranslator:
    """Owns the webcam, runs the translation loop in a background thread, exposes the
    latest annotated frame, the live word/sentence state and the completed sentences."""

    def __init__(self, store: ModelStore):
        self.store = store
        self._ctl_lock = threading.Lock()    # start / stop
        self._data_lock = threading.Lock()   # frame, label, completed sentences, flags
        self._pred_lock = threading.Lock()   # predictor + word log
        self._stop = threading.Event()       # a fresh event is created for every run
        self._thread = None
        self._predictor = None
        self._running = False
        self._opening = False
        self._error = None
        self._jpeg = None
        self._frame_id = 0
        self._state = {"label": "—", "confidence": 0.0}
        self._sentences = []                 # completed sentences (kept until cleared)
        self._word_seq = 0
        self._word_log = deque(maxlen=20)    # recent words, used by the UI to speak new ones

    # -----------------------  camera control   ----------------------------------
    def start(self):
        """Returns immediately. The background thread opens the camera."""
        with self._ctl_lock:
            if self._running:
                return
            stop_evt = threading.Event()
            self._stop = stop_evt
            with self._pred_lock:
                self._predictor = Predictor(self.store)
            with self._data_lock:
                self._running = True
                self._opening = True
                self._error = None
                self._jpeg = None
                self._state = {"label": "—", "confidence": 0.0}
            self._thread = threading.Thread(target=self._run, args=(stop_evt,), daemon=True)
            self._thread.start()

    def stop(self):
        with self._ctl_lock:
            self._stop.set()
            with self._data_lock:
                self._running = False
                self._opening = False
                self._jpeg = None
            thread, self._thread = self._thread, None
        if thread and thread.is_alive():
            thread.join(timeout=3)

    # ---------- sentence controls ----------
    def complete_sentence(self) -> str:
        with self._pred_lock:
            words = self._predictor.take_sentence() if self._predictor else []
        if not words:
            return ""
        text = " ".join(words) + "."
        with self._data_lock:
            self._sentences.append(text)
            del self._sentences[:-config.HISTORY_LIMIT]
        return text

    def undo_word(self):
        with self._pred_lock:
            return self._predictor.undo_word() if self._predictor else None

    def remove_word_at(self, index: int):
        with self._pred_lock:
            return self._predictor.remove_word(index) if self._predictor else None

    def move_word(self, src: int, to: int) -> bool:
        with self._pred_lock:
            return self._predictor.move_word(src, to) if self._predictor else False

    def clear_sentence(self):
        with self._pred_lock:
            if self._predictor:
                self._predictor.take_sentence()

    def clear_history(self):
        with self._data_lock:
            self._sentences.clear()

    # ---------- state + video ----------
    def get_state(self) -> dict:
        with self._pred_lock:
            words = list(self._predictor.sentence) if self._predictor else []
            recent_words = list(self._word_log)
            word_seq = self._word_seq
        with self._data_lock:
            return {**self._state, "running": self._running, "opening": self._opening,
                    "error": self._error, "words": words, "sentences": list(self._sentences),
                    "word_seq": word_seq, "recent_words": recent_words}

    def latest_jpeg(self):
        """Newest annotated frame (JPEG bytes), or None if the camera is off."""
        with self._data_lock:
            return self._jpeg

    async def mjpeg(self):
        """Async generator for the multipart MJPEG video stream."""
        last_id = -1
        while self._running:
            with self._data_lock:
                jpeg, frame_id = self._jpeg, self._frame_id
            if jpeg is None or frame_id == last_id:
                await asyncio.sleep(0.01)
                continue
            last_id = frame_id
            yield (b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                   + str(len(jpeg)).encode() + b"\r\n\r\n" + jpeg + b"\r\n")

    # ---------- the camera loop ----------
    def _set_error(self, stop_evt, message):
        with self._data_lock:
            if self._stop is stop_evt:
                self._error = message

    def _run(self, stop_evt):
        cap = None
        try:
            cap = _open_camera()
            if not cap.isOpened():
                self._set_error(stop_evt, f"Could not open webcam index {config.CAMERA_INDEX}. Close any other "
                                          "app, notebook or browser tab that is using the camera, then try again.")
                return
            if stop_evt.is_set():
                return
            with self._data_lock:
                if self._stop is stop_evt:
                    self._opening = False

            with mp_holistic.Holistic(min_detection_confidence=0.5, min_tracking_confidence=0.5) as holistic:
                while not stop_evt.is_set():
                    ok, frame = cap.read()
                    if not ok:
                        self._set_error(stop_evt, "Camera stopped sending frames.")
                        break
                    frame = cv2.flip(frame, 1)                      # as in the notebook
                    results = mediapipe_detection(frame, holistic)  # as in the notebook
                    keypoints = extract_keypoints(results)          # as in the notebook

                    with self._pred_lock:
                        pred = self._predictor.update(keypoints)
                        if pred["new_word"]:
                            self._word_seq += 1
                            self._word_log.append({"id": self._word_seq, "word": pred["new_word"]})

                    # ---- display only, after features are computed ----
                    if config.DRAW_SKELETON:
                        draw_landmarks(frame, results)
                    draw_boxes(frame, results)
                    ok_enc, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, config.STREAM_JPEG_QUALITY])

                    with self._data_lock:
                        if self._stop is stop_evt and not stop_evt.is_set():
                            if ok_enc:
                                self._jpeg = buf.tobytes()
                                self._frame_id += 1
                            self._state = {"label": pred["label"], "confidence": pred["confidence"]}
        except Exception as exc:
            self._set_error(stop_evt, f"Translation stopped: {exc}")
        finally:
            if cap is not None:
                cap.release()
            with self._data_lock:
                if self._stop is stop_evt:
                    self._running = False
                    self._opening = False
                    self._jpeg = None


                    