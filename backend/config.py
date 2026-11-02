"""Central configuration. Feature/model constants live in features.py (from the notebook)."""
from pathlib import Path

HOST = "127.0.0.1"
PORT = 8000

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
MODEL_DIR = BASE_DIR / "models"

MODEL_PATH = MODEL_DIR / "isl_12_word_lstm.h5"
METADATA_PATH = MODEL_DIR / "isl_12_word_metadata.json"

# Camera (same default index as the notebook's CAMERA_INDEX)
# Camera
CAMERA_INDEX = 0
CAMERA_BACKEND = None   # None = OpenCV default (same as the notebook).
                        # If the camera is very slow to open on Windows, try "dshow".

# Live prediction smoothing (same values as the notebook's live_test)
THRESHOLD = 0.70
HISTORY_SIZE = 8

# --- Live word commit rules (the fix for stray words like Tuesday/Water before Thursday) ---
SAMPLE_FPS = 20             # feed the model at the training frame rate (0 = use every camera frame)
MIN_CONFIDENCE = 0.80       # a frame only counts toward a word if the model is at least this sure
MIN_MARGIN = 0.30           # ...and the best word beats the 2nd best by this much
MIN_STABLE_FRAMES = 12      # the SAME word must win this many frames in a row (~0.6 s) before it is added
MEAN_CONFIDENCE = 0.85      # average confidence over that run must reach this
RUN_GAP_TOLERANCE = 2       # a run survives this many bad frames in a row (noise) without restarting
HANDS_RECENT_WINDOW = 8     # look at the last N frames for hands...
HANDS_RECENT_MIN = 5        # ...hands must be visible in at least this many, else "No sign"
REARM_ABSENT_FRAMES = 10    # hands out of view this long = action finished, ready for the next word
DEBUG_PREDICTIONS = False   # True = print committed words and rejected candidates in the terminal

# Sentence building (output only, does not affect model input)
SENTENCE_LENGTH = 30          # max words in the sentence being built
HISTORY_LIMIT = 50            # completed sentences kept
AUTO_COMPLETE_SECONDS = 4     # pause length for the "Auto-complete after pause" option

# Display only (never affects model input)
STREAM_JPEG_QUALITY = 80
DRAW_SKELETON = False         # True = also draw the notebook's face mesh / pose / hand lines