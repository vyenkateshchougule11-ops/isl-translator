"""Drawing only. Runs AFTER keypoints are extracted, so it never affects model input."""
import cv2
import mediapipe as mp

from .features import mp_holistic

mp_drawing = mp.solutions.drawing_utils

BLUE = (255, 128, 47)    # BGR of #2f80ff  (face)
YELLOW = (21, 204, 250)  # BGR of #facc15  (hands)


def _draw_box(frame, landmark_list, color, text, pad=0.02):
    h, w = frame.shape[:2]
    xs = [lm.x for lm in landmark_list.landmark]
    ys = [lm.y for lm in landmark_list.landmark]
    x1 = int(max(0.0, min(xs) - pad) * w)
    y1 = int(max(0.0, min(ys) - pad) * h)
    x2 = int(min(1.0, max(xs) + pad) * w)
    y2 = int(min(1.0, max(ys) + pad) * h)
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 3)
    cv2.putText(frame, text, (x1 + 4, max(18, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)


def draw_boxes(frame, results):
    if results.face_landmarks:
        _draw_box(frame, results.face_landmarks, BLUE, "Face")
    if results.left_hand_landmarks:
        _draw_box(frame, results.left_hand_landmarks, YELLOW, "Hand")
    if results.right_hand_landmarks:
        _draw_box(frame, results.right_hand_landmarks, YELLOW, "Hand")


def draw_landmarks(frame, results):
    """Copied verbatim from the notebook (optional skeleton lines, see config.DRAW_SKELETON)."""
    if results.face_landmarks:
        mp_drawing.draw_landmarks(
            frame, results.face_landmarks, mp_holistic.FACEMESH_TESSELATION,
            landmark_drawing_spec=None,
            connection_drawing_spec=mp_drawing.DrawingSpec(thickness=1, circle_radius=1)
        )
    if results.pose_landmarks:
        mp_drawing.draw_landmarks(frame, results.pose_landmarks, mp_holistic.POSE_CONNECTIONS)
    if results.left_hand_landmarks:
        mp_drawing.draw_landmarks(frame, results.left_hand_landmarks, mp_holistic.HAND_CONNECTIONS)
    if results.right_hand_landmarks:
        mp_drawing.draw_landmarks(frame, results.right_hand_landmarks, mp_holistic.HAND_CONNECTIONS)


        