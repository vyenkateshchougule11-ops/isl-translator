"""Model loading and live prediction.
`Predictor.update` is the notebook's live_test() logic. The small 'hold' rule and the
sentence helpers (take_sentence / undo_word) only manage the output text."""
import json
from collections import Counter, deque

import numpy as np

from . import config
from .features import FEATURE_LENGTH


class ModelStore:
    """Loads the trained model + metadata once at startup. Fails loudly if anything is wrong."""

    def __init__(self):
        self.model = None
        self.meta = {}
        self.actions = []
        self.idle_label = None
        self.seq_len = 60

    def load(self):
        if not (config.MODEL_PATH.exists() and config.METADATA_PATH.exists()):
            raise FileNotFoundError(
                "Trained model not found. Put these files in the 'models' folder:\n"
                f"  {config.MODEL_PATH.name}\n  {config.METADATA_PATH.name}")

        from tensorflow.keras.models import load_model

        with open(config.METADATA_PATH, "r", encoding="utf-8") as f:
            self.meta = json.load(f)
        self.actions = self.meta["actions"]
        self.idle_label = self.meta.get("idle_label")
        self.seq_len = self.meta["sequence_length"]
        self.model = load_model(config.MODEL_PATH)

        # Safety checks: model and metadata must belong together
        if self.model.output_shape[-1] != len(self.actions):
            raise ValueError(f"Model has {self.model.output_shape[-1]} outputs but metadata lists "
                             f"{len(self.actions)} actions. Use the matching model + metadata pair.")
        if tuple(self.model.input_shape[1:]) != (self.seq_len, FEATURE_LENGTH):
            raise ValueError(f"Model input {self.model.input_shape} does not match "
                             f"({self.seq_len}, {FEATURE_LENGTH}).")

        print(f"[ISL] Model loaded: {len(self.words)} words + idle class, "
              f"test accuracy {self.meta.get('test_accuracy', 0):.4f}")

    @property
    def words(self) -> list:
        return self.meta.get("words") or [a for a in self.actions if a != self.idle_label]

    def info(self) -> dict:
        return {
            "words": self.words,
            "idle_label": self.idle_label,
            "test_accuracy": self.meta.get("test_accuracy"),
            "auto_complete_seconds": config.AUTO_COMPLETE_SECONDS,
        }


def hands_visible(kp) -> bool:
    """True if MediaPipe really saw a hand in this frame.
    A missing hand is all zeros BEFORE normalisation, so after normalisation all 21 of its
    landmarks collapse onto one identical point; a real hand always has spread."""
    for sl in (slice(132, 195), slice(195, 258)):
        pts = np.asarray(kp[sl], dtype=np.float32).reshape(21, 3)
        if float(np.ptp(pts, axis=0).max()) > 1e-4:
            return True
    return False


class Predictor:
    """Per-run state: frame window, one-word-per-action commit logic and the sentence being built.

    Why the old logic produced extra words: the model sees a sliding window of the last 60 frames,
    and a window that is half 'old movement' + half 'new movement' is a pose it never trained on.
    It still answers confidently (softmax always does), and because consecutive windows overlap by
    59 of 60 frames, the same wrong answer repeats frame after frame, so a '3 of the last 8' vote
    passes instantly. Now a word is only added when the SAME word wins a long unbroken run with
    high confidence and a clear margin, hands must be in view, and after a word is added the
    predictor stays locked until the hands go down or a different word wins its own long run."""

    def __init__(self, store: ModelStore):
        self.store = store
        self.sequence = deque(maxlen=store.seq_len)
        self.sentence = deque(maxlen=config.SENTENCE_LENGTH)
        self.recent_predictions = deque(maxlen=config.HISTORY_SIZE)   # kept for compatibility
        self._hold_label = None   # sign still being held after complete/undo -> don't re-add it
        self._hands = deque(maxlen=config.HANDS_RECENT_WINDOW)
        self._last_sample = 0.0
        self._absent = 0
        self._locked = None       # word just committed; ignored until re-armed
        self._reset_run()
        self._last_view = ("Collecting frames...", 0.0)

    def _reset_run(self):
        self._run_idx, self._run_len, self._run_sum, self._run_gap = None, 0, 0.0, 0

    def _idle_view(self):
        return {"label": self.store.idle_label or "No sign", "confidence": 0.0, "new_word": None}

    def update(self, keypoints) -> dict:
        import time
        # 1) feed the model at the training frame rate, not whatever the camera happens to deliver
        if config.SAMPLE_FPS:
            now = time.monotonic()
            if now - self._last_sample < 1.0 / config.SAMPLE_FPS:
                return {"label": self._last_view[0], "confidence": self._last_view[1], "new_word": None}
            self._last_sample = now
        self.sequence.append(keypoints)
        self._hands.append(hands_visible(keypoints))

        if len(self.sequence) < self.store.seq_len:
            return {"label": "Collecting frames...", "confidence": 0.0, "new_word": None}

        # 2) no hands in view -> nothing is being signed. Never ask the model (it would guess).
        if sum(self._hands) < config.HANDS_RECENT_MIN:
            self._absent += 1
            self._reset_run()
            if self._absent >= config.REARM_ABSENT_FRAMES:
                self._locked = None
                self._hold_label = None
            out = self._idle_view()
            self._last_view = (out["label"], 0.0)
            return out
        self._absent = 0

        # 3) predict on the sliding window
        actions, idle = self.store.actions, self.store.idle_label
        sample = np.expand_dims(np.asarray(self.sequence, dtype=np.float32), axis=0)
        p = self.store.model.predict(sample, verbose=0)[0]
        order = np.argsort(p)[::-1]
        idx, conf = int(order[0]), float(p[order[0]])
        margin = conf - float(p[order[1]])
        good = conf >= config.MIN_CONFIDENCE and margin >= config.MIN_MARGIN

        # 4) track an unbroken run of the same winner
        if good and idx == self._run_idx:
            self._run_len += 1; self._run_sum += conf; self._run_gap = 0
        elif good:
            self._run_idx, self._run_len, self._run_sum, self._run_gap = idx, 1, conf, 0
        else:
            self._run_gap += 1
            if self._run_gap > config.RUN_GAP_TOLERANCE:
                self._reset_run()

        # 5) commit once, only for a long, confident, clear run
        new_word, label = None, "Listening..."
        if self._run_idx is not None and self._run_len >= 3:
            label = str(actions[self._run_idx])
        if (self._run_idx is not None and self._run_len >= config.MIN_STABLE_FRAMES
                and self._run_sum / self._run_len >= config.MEAN_CONFIDENCE):
            word = str(actions[self._run_idx])
            if idle is not None and word == idle:
                self._locked = None                      # model says 'no sign': ready for the next word
                label = idle
            elif word != self._locked and word != self._hold_label:
                if not self.sentence or self.sentence[-1] != word:
                    self.sentence.append(word)
                    new_word = word
                self._locked = word
                self._hold_label = None
                if config.DEBUG_PREDICTIONS:
                    print(f"[ISL] committed {word} (run {self._run_len}, mean {self._run_sum/self._run_len:.2f})")
            if word == self._locked:
                label = word
        self._last_view = (label, round(conf, 3))
        return {"label": label, "confidence": round(conf, 3), "new_word": new_word}

    # ---- sentence controls ----
    def take_sentence(self) -> list:
        """Return the words so far and start a fresh sentence."""
        words = list(self.sentence)
        if words:
            self._hold_label = words[-1]
        self.sentence.clear()
        self.recent_predictions.clear()
        self._reset_run()
        return words

    def undo_word(self):
        """Remove the last word (for a wrong prediction)."""
        if not self.sentence:
            return None
        word = self.sentence.pop()
        self._hold_label = word
        self.recent_predictions.clear()
        return word


# -----------------      These are new changes   ------------------------------------------------------------------- 
    def remove_word(self, index: int):
        """Remove the word at `index` (for a wrongly detected word anywhere in the sentence)."""
        if not 0 <= index < len(self.sentence):
            return None
        is_last = index == len(self.sentence) - 1
        word = self.sentence[index]
        del self.sentence[index]
        if is_last:  # last word removed: don't re-add it while the sign is still being held
            self._hold_label = word
            self.recent_predictions.clear()
        return word

    def move_word(self, src: int, to: int) -> bool:
        """Move the word at `src` so it ends up at position `to` (used by drag-and-drop)."""
        n = len(self.sentence)
        if not (0 <= src < n and 0 <= to < n) or src == to:
            return False
        items = list(self.sentence)
        items.insert(to, items.pop(src))
        self.sentence.clear()
        self.sentence.extend(items)
        return True

#  ---------------------------     New Changes Finished ---------------------------------------------------------------