"""Stereo calibration knobs — data, not magic constants.

Baseline/focal/principal-point come from the physical rig and differ between
the lunar-regolith rig and the Mars-analog rig; SGBM matcher params are a
per-dataset tuning surface (texture, lighting, disparity range). P6
(dataset-agent) supplies real per-dataset values — `DEFAULT_CALIBRATION`
below is a documented placeholder for synthetic self-checks only, never a
value to trust for a real scene.
"""
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class Calibration:
    """Pinhole stereo rig calibration + SGBM matcher tuning.

    Units: metres for baseline, pixels for focal length / principal point.
    disparity_to_depth: depth = (baseline_m * focal_px) / disparity_px.
    """
    baseline_m: float          # distance between left/right optical centres (m)
    focal_px: float            # rectified focal length (pixels)
    cx: float                  # principal point x (pixels)
    cy: float                  # principal point y (pixels)

    # cv2.StereoSGBM tuning — see cv2 docs for exact semantics.
    min_disparity: int = 0
    num_disparities: int = 64      # must be divisible by 16
    block_size: int = 5            # odd, >=1
    uniqueness_ratio: int = 10     # % margin best-vs-second-best match cost
    speckle_window_size: int = 100
    speckle_range: int = 2
    disp12_max_diff: int = 1

    # invalid-disparity guard: disparities at/below this (incl. SGBM's
    # dedicated "no match" sentinel) become NaN depth, never a fabricated one
    min_valid_disparity_px: float = 1.0


# Placeholder rig for synthetic self-checks / dev only. NOT a real dataset
# calibration — P6 overrides this per lunar/mars dataset via loaded JSON.
DEFAULT_CALIBRATION = Calibration(
    baseline_m=0.12, focal_px=700.0, cx=320.0, cy=240.0,
)
