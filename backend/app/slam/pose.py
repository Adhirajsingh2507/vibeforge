"""Frame-to-frame pose estimation for SLAM fusion (P4).

Registers consecutive frames by searching for the integer grid-cell shift
that best aligns their height fields (SSD over the finite-valued overlap,
numpy only — no cv2). Height is used because `DepthCell.height` is always
present in the P4 handoff (seg/RGB is comparatively low-signal on repetitive
terrain), and a shift that minimises SSD on real geometry is a standard,
cheap scan-matching approach that needs no trained model.

Confidence is derived from the match's *sharpness* (how much better the best
shift is than the average candidate) and *coverage* (how much finite-valued
overlap backed the match) — a flat/feature-less patch of regolith naturally
scores every shift about the same, so it comes out low-confidence without a
separate "is this flat?" check. That confidence both blends with an optional
external pose hint (wheel odometry / IMU — real sensors drift, so the blend
weight is a tunable knob, not fused blindly) and drives the rover_path
degradation ladder (full -> cautious -> survey-only -> safe-hold).

Registration and pose are purely translational in grid-cell units (no
rotation estimation) — sufficient for the rover's near-planar traverse.
Pure numpy + stdlib.
"""
from __future__ import annotations
import math
from dataclasses import dataclass

import numpy as np

# --- tunable calibration knobs (real sensors drift; tune per rover/dataset) ---
SEARCH_RADIUS_DEFAULT = 3     # max grid-cell shift searched per axis
MIN_OVERLAP_CELLS = 4         # below this many finite-valued overlap cells, a
                               # candidate shift is untrustworthy -> rejected
REG_CONF_FLOOR = 0.05         # a match is never reported as exactly zero trust
REG_CONF_CAP = 0.95           # ...nor as fully certain (heuristic, not truth)
ODOM_WEIGHT_DEFAULT = 0.35    # weight given to an external pose_hint (odometry/
                               # IMU) vs. vision registration in the blend
MODE_FULL = 0.6               # pose conf >= this -> full drive mode
MODE_CAUTIOUS = 0.35          # >= this -> cautious
MODE_SURVEY = 0.15            # >= this -> survey-only; below -> safe-hold


@dataclass
class Pose:
    """One frame's estimated world pose. x, y in grid-cell units (not metres);
    heading in degrees (0 = +x axis, ccw); conf in [0,1], never overconfident."""
    t: int
    x: float
    y: float
    heading: float
    conf: float
    mode: str


def _height_array(depth_grid) -> np.ndarray:
    return np.asarray([[c.height for c in row] for row in depth_grid], dtype=float)


def _score_shift(prev: np.ndarray, curr: np.ndarray, dx: int, dy: int) -> tuple[float, int]:
    """Mean squared residual (and overlap size) aligning curr shifted by
    (dx, dy) onto prev. inf score / 0 overlap if the shift leaves too little
    finite-valued overlap to trust."""
    h, w = prev.shape
    y0, y1 = max(0, -dy), min(h, h - dy)
    x0, x1 = max(0, -dx), min(w, w - dx)
    if y1 <= y0 or x1 <= x0:
        return math.inf, 0
    diff = prev[y0:y1, x0:x1] - curr[y0 + dy:y1 + dy, x0 + dx:x1 + dx]
    mask = np.isfinite(diff)
    n = int(mask.sum())
    if n < MIN_OVERLAP_CELLS:
        return math.inf, 0
    return float(np.sum(diff[mask] ** 2) / n), n


def register(prev_height, curr_height, search_radius: int = SEARCH_RADIUS_DEFAULT
             ) -> tuple[int, int, float]:
    """Two height grids (grid[y][x] floats, may hold NaN) -> (dx, dy, conf):
    the rover's grid-cell motion between prev and curr (i.e. curr's world
    footprint = prev's footprint shifted by (dx, dy)), and a conservative
    confidence in [REG_CONF_FLOOR, REG_CONF_CAP]. (0, 0, REG_CONF_FLOOR) when
    no candidate shift has enough overlap to trust — never a fabricated move."""
    prev = np.asarray(prev_height, dtype=float)
    curr = np.asarray(curr_height, dtype=float)
    scored = {}
    for dx in range(-search_radius, search_radius + 1):
        for dy in range(-search_radius, search_radius + 1):
            # _score_shift aligns curr(x+dx) with prev(x), i.e. -dx is the
            # rover's world motion; search in that space, report the motion.
            score, n = _score_shift(prev, curr, dx, dy)
            if math.isfinite(score):
                scored[(dx, dy)] = (score, n)
    if not scored:
        return 0, 0, REG_CONF_FLOOR
    best_shift = min(scored, key=lambda k: scored[k][0])
    best_score, best_n = scored[best_shift]
    mean_score = sum(s for s, _ in scored.values()) / len(scored)
    # sharpness: 0 when every candidate scores about the same (feature-less
    # patch — can't tell shifts apart), -> 1 as the best shift dominates.
    sharpness = 0.0 if mean_score <= 0 else max(0.0, 1.0 - best_score / mean_score)
    coverage = min(1.0, best_n / prev.size)
    conf = REG_CONF_FLOOR + (REG_CONF_CAP - REG_CONF_FLOOR) * sharpness * coverage
    motion_dx, motion_dy = -best_shift[0], -best_shift[1]
    return motion_dx, motion_dy, round(min(REG_CONF_CAP, max(REG_CONF_FLOOR, conf)), 4)


def _drive_mode(conf: float) -> str:
    if conf >= MODE_FULL:
        return "full"
    if conf >= MODE_CAUTIOUS:
        return "cautious"
    if conf >= MODE_SURVEY:
        return "survey-only"
    return "safe-hold"


def track_poses(frames, search_radius: int = SEARCH_RADIUS_DEFAULT,
                 odom_weight: float = ODOM_WEIGHT_DEFAULT) -> list[Pose]:
    """Frame sequence -> Pose per frame (dead-reckoned via registration,
    optionally drift-corrected by each frame's `pose_hint`).

    frames: [{"t": int, "seg": grid[y][x] SegCell, "depth": grid[y][x]
    DepthCell, "pose_hint": {"x","y"} | None}], acquisition order. The first
    frame anchors the world origin (pose (0,0), full trust by definition —
    nothing to register it against).
    """
    poses: list[Pose] = []
    x = y = heading = 0.0
    prev_height = None
    for i, f in enumerate(frames):
        t = f.get("t", i)
        curr_height = _height_array(f["depth"])
        if prev_height is None:
            conf = REG_CONF_CAP
        else:
            dx, dy, reg_conf = register(prev_height, curr_height, search_radius)
            vis_x, vis_y = x + dx, y + dy
            hint = f.get("pose_hint")
            if hint is not None:
                w = max(0.0, min(1.0, odom_weight))
                x = (1 - w) * vis_x + w * hint["x"]
                y = (1 - w) * vis_y + w * hint["y"]
                # an external hint backstops a poor visual match, never worse
                # than the raw registration confidence alone
                conf = max(reg_conf, w * REG_CONF_CAP)
            else:
                x, y, conf = vis_x, vis_y, reg_conf
            if dx or dy:
                heading = math.degrees(math.atan2(dy, dx)) % 360
        poses.append(Pose(t, x, y, heading, conf, _drive_mode(conf)))
        prev_height = curr_height
    return poses


def _demo():
    from app.contracts import DepthCell, SegCell

    def _frame(t, heights, hint=None):
        depth = [[DepthCell(h, 0.0, 0.0) for h in row] for row in heights]
        seg = [[SegCell("soil", 0.5) for _ in row] for row in heights]
        f = {"t": t, "seg": seg, "depth": depth}
        if hint is not None:
            f["pose_hint"] = hint
        return f

    # a ramp shifted by a known (dx=2) recovers that exact shift; a tiny
    # row-dependent term breaks y-degeneracy (a pure x-ramp is dy-ambiguous)
    world = [[float(x) + 0.01 * y for x in range(10)] for y in range(3)]
    crop_a = [row[0:6] for row in world]
    crop_b = [row[2:8] for row in world]
    dx, dy, conf = register(crop_a, crop_b)
    assert (dx, dy) == (2, 0), (dx, dy)
    assert conf > MODE_FULL, conf   # unambiguous ramp -> high confidence

    # a flat, feature-less patch can't be registered confidently -> floor
    flat_a = [[5.0] * 6 for _ in range(3)]
    flat_b = [[5.0] * 6 for _ in range(3)]
    _, _, flat_conf = register(flat_a, flat_b)
    assert flat_conf == REG_CONF_FLOOR, flat_conf
    assert _drive_mode(flat_conf) == "safe-hold"

    # track_poses: dead reckoning across a clean sequence recovers the offset,
    # and an odom hint nudges (but doesn't override) the vision estimate
    frames = [_frame(0, crop_a), _frame(1, crop_b, hint={"x": 2.6, "y": 0.0})]
    poses = track_poses(frames)
    assert poses[0].x == 0.0 and poses[0].mode == "full"
    assert 2.0 < poses[1].x < 2.6, poses[1]   # blended, not pure vision or pure hint
    assert poses[1].mode == "full"

    print("pose self-check ok")


if __name__ == "__main__":
    _demo()
