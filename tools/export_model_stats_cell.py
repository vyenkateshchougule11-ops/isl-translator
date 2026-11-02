# ===== Export model statistics for the web app's Statistics page =====
# Add this as a NEW cell at the end of your training notebook and run it once.
# It only READS your data and model. Nothing in the notebook is changed.
import json
from datetime import datetime
from pathlib import Path
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import confusion_matrix, classification_report
from tensorflow.keras.models import load_model

PROJECT = Path(r"E:\NewCompleteISL")                       # <-- your project folder
MODEL_FILE = PROJECT / "models" / "isl_12_word_lstm.h5"
META_FILE  = PROJECT / "models" / "isl_12_word_metadata.json"
OUT_FILE   = PROJECT / "frontend" / "data" / "model_stats.json"

model = load_model(MODEL_FILE)
meta = json.loads(META_FILE.read_text(encoding="utf-8"))

X, y_idx, actions = load_dataset_for_vocab()               # same loader as training
if list(actions) != list(meta["actions"]):
    raise RuntimeError("The words in this notebook do not match the model's "
                       "metadata. Use the data this model was trained on.")

# Same split as training: 80 / 20, random_state = 42, stratified
X_train, X_test, y_train, y_test = train_test_split(
    X, y_idx, test_size=0.20, random_state=42, stratify=y_idx)

pred = np.argmax(model.predict(X_test, verbose=0), axis=1)
labels = np.arange(len(actions))
cm = confusion_matrix(y_test, pred, labels=labels)
report = classification_report(y_test, pred, labels=labels, target_names=actions,
                               output_dict=True, zero_division=0)

def counts(y):
    c = np.bincount(y, minlength=len(actions))
    return {a: int(c[i]) for i, a in enumerate(actions)}

stats = {
    "generated_at": datetime.now().isoformat(timespec="seconds"),
    "classes": list(actions),
    "idle_label": meta.get("idle_label"),
    "accuracy": float((pred == y_test).mean()),
    "confusion_matrix": cm.tolist(),
    "report": {k: ({m: float(v) for m, v in d.items()} if isinstance(d, dict) else float(d))
               for k, d in report.items()},
    "class_counts": {"total": counts(y_idx), "train": counts(y_train), "test": counts(y_test)},
}

# Training curves are included if this notebook session still holds the
# `history` returned by:   model, history, acc = train_on_all_data()
try:
    h = history.history
    stats["history"] = {k: [float(v) for v in h[k]]
                        for k in ("accuracy", "val_accuracy", "loss", "val_loss") if k in h}
except NameError:
    print("No training history in this session, so the curves are skipped.")

OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
OUT_FILE.write_text(json.dumps(stats, indent=2), encoding="utf-8")
print("Saved:", OUT_FILE)
print("Test accuracy:", round(stats["accuracy"], 4))
