# ISL Translator – Real-Time Indian Sign Language to Text and Speech

A computer-vision-based application that uses a webcam to recognize selected Indian Sign Language (ISL) gestures and display the predicted words as text. It also provides sentence-building controls, optional browser text-to-speech, and an optional read-only live-view link.

> **Project scope:** This repository contains a limited-vocabulary academic prototype, not a complete translator for all Indian Sign Language.

## Features

- Webcam-based gesture capture using OpenCV.
- Pose and hand landmark extraction using MediaPipe Holistic.
- Shoulder-centred landmark normalization.
- Sequence classification using a trained TensorFlow/Keras LSTM model.
- FastAPI backend with REST endpoints and MJPEG video streaming.
- Browser dashboard for live predictions and sentence building.
- Sentence controls including undo, remove, reorder, complete, and clear.
- Optional browser text-to-speech.
- Optional token-protected, read-only live sharing through a Cloudflare Quick Tunnel.

## Technology Stack

- **Language:** Python, JavaScript, HTML, CSS
- **Backend:** FastAPI, Uvicorn
- **Computer vision:** OpenCV, MediaPipe Holistic
- **Machine learning:** TensorFlow/Keras, LSTM, NumPy
- **Model input:** 60-frame sequences with 258 features per frame
- **Model artifacts:** HDF5 (`.h5`) model and JSON metadata

## Repository Structure

```text
isl-translator/
├── backend/
│   ├── config.py
│   ├── features.py
│   ├── main.py
│   ├── overlay.py
│   ├── pipeline.py
│   ├── predictor.py
│   └── share.py
├── frontend/
│   ├── css/
│   ├── data/
│   ├── js/
│   ├── about.html
│   ├── index.html
│   ├── stats.html
│   ├── translate.html
│   └── viewer.html
├── models/
│   ├── isl_12_word_lstm.h5
│   └── isl_12_word_metadata.json
├── tools/
│   └── export_model_stats_cell.py
├── requirements.txt
├── run.py
├── .gitignore
└── README.md
```

## Requirements

- Windows 10/11 (the project was developed for a local webcam workflow).
- Python 3.10 or 3.11 recommended.
- A working webcam.
- Internet access for installing Python dependencies.
- `cloudflared` is optional and only needed for the live-sharing feature.

## Setup and Run

Open PowerShell in the project root directory.

### 1. Create and activate a virtual environment

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation for this terminal session, run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### 2. Install dependencies

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 3. Start the application

```powershell
python run.py
```

The launcher starts the FastAPI application and opens the local dashboard when the server is ready. The default address is:

```text
http://127.0.0.1:8000
```

Allow the browser to use the webcam. Close other applications that may be using the camera if it cannot be opened.

To stop the application, press `Ctrl+C` in the terminal.

## Model and Evaluation Information

The included metadata file records the following model configuration:

- 30 sign-word labels plus one idle/no-sign class (31 output classes).
- Sequence length: 60 frames.
- Feature length: 258 values per frame.
- Feature layout: 33 pose landmarks × 4 values, 21 left-hand landmarks × 3 values, and 21 right-hand landmarks × 3 values.
- Normalization: coordinates are centred on the shoulder midpoint and scaled by shoulder width.
- Recorded test accuracy in `models/isl_12_word_metadata.json`: **94.62%**.

The accuracy above is the value stored in the included model metadata. It should be interpreted in the context of the project's dataset and evaluation procedure; it is not a guarantee of performance for every signer, camera, lighting condition, or real-world environment.

## Optional Live Sharing

The live-view feature uses Cloudflare Quick Tunnel through `cloudflared`. Install it separately if you want to use this feature:

```powershell
winget install --id Cloudflare.cloudflared
```

Open a new terminal after installation, start the application, and use the dashboard's sharing control. The application generates a temporary token-protected, read-only viewer link. Stop sharing from the dashboard when finished.

Do not publish a live sharing URL or token in this repository.

## Dataset and Training

The trained model and its matching metadata are included in `models/`. The original training dataset and training notebook are not included in this repository. The application can run inference using the supplied model files without downloading the training dataset.

Keep the model file and its matching metadata together. The backend checks that the model output dimensions and input shape match the metadata and expected feature dimensions.

## Limitations

- The system recognizes only the vocabulary represented by the included model.
- Recognition quality can vary with camera placement, lighting, signing speed, signer variation, and hand visibility.
- The project is an academic prototype and should not be treated as a certified accessibility or communication service.
- Text-to-speech uses browser speech synthesis support and may vary by browser and operating system.

## Author

**Vyenkatesh Chougule**

- GitHub: https://github.com/vyenkateshchougule11-ops
- LinkedIn: [Add your LinkedIn profile URL]

## License

No license has been added yet. If you intend others to reuse, modify, or distribute this project, choose and add an appropriate open-source license. Until then, all rights remain with the copyright holder.
