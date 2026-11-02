"""Feature extraction copied verbatim from the training notebook. Do not modify:
the saved model expects exactly these 258 features per frame."""
import cv2
import numpy as np
import mediapipe as mp

mp_holistic = mp.solutions.holistic

POSE_LANDMARKS = 33
HAND_LANDMARKS = 21
FEATURE_LENGTH = POSE_LANDMARKS*4 + HAND_LANDMARKS*3 + HAND_LANDMARKS*3  # 258, no face mesh
LEFT_SHOULDER_IDX, RIGHT_SHOULDER_IDX = 11, 12


def mediapipe_detection(frame, holistic):
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    rgb.flags.writeable = False
    results = holistic.process(rgb)
    rgb.flags.writeable = True
    return results


def extract_keypoints(results):
    pose = (np.array([[lm.x, lm.y, lm.z, lm.visibility] for lm in results.pose_landmarks.landmark], dtype=np.float32)
            if results.pose_landmarks else np.zeros((POSE_LANDMARKS, 4), dtype=np.float32))
    left = (np.array([[lm.x, lm.y, lm.z] for lm in results.left_hand_landmarks.landmark], dtype=np.float32)
            if results.left_hand_landmarks else np.zeros((HAND_LANDMARKS, 3), dtype=np.float32))
    right = (np.array([[lm.x, lm.y, lm.z] for lm in results.right_hand_landmarks.landmark], dtype=np.float32)
             if results.right_hand_landmarks else np.zeros((HAND_LANDMARKS, 3), dtype=np.float32))

    if results.pose_landmarks:
        l_sh = pose[LEFT_SHOULDER_IDX, :3]
        r_sh = pose[RIGHT_SHOULDER_IDX, :3]
        center = (l_sh + r_sh) / 2.0
        scale = float(np.linalg.norm(l_sh - r_sh))
        scale = scale if scale > 1e-4 else 1.0
    else:
        center = np.zeros(3, dtype=np.float32)
        scale = 1.0

    pose_xyz = (pose[:, :3] - center) / scale
    pose_norm = np.concatenate([pose_xyz, pose[:, 3:4]], axis=1).flatten()
    left_norm = ((left - center) / scale).flatten()
    right_norm = ((right - center) / scale).flatten()

    out = np.concatenate([pose_norm, left_norm, right_norm]).astype(np.float32)
    assert out.shape == (FEATURE_LENGTH,)
    return out