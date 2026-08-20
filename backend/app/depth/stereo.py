"""Real stereo depth: rectified left/right pair -> disparity -> metric height
grid -> per-cell slope/roughness (via the existing `derive_geometry`).

Requires `cv2` (opencv-python-headless, see requirements-cv.txt) for the SGBM
matcher only. `cv2` is imported lazily inside `disparity()` so this module —
and the rest of the pipeline, which never imports it — still loads on a
machine without opencv installed; callers get a clear RuntimeError instead of
an ImportError at module load time.

Inputs are rectified 8-bit single-channel (grayscale) images; rectification
and colour conversion belong to preprocessing, not here. Depth is the metric
distance along the camera's optical axis (baseline * focal / disparity) — used
directly as the height/elevation proxy for slope+roughness, same as the P1
fixture's height grid. Converting camera-frame depth into world-frame
elevation via rover pose is SLAM's job (P4), not this module's.
"""
from __future__ import annotations
import math
import numpy as np

from app.depth.calibration import Calibration, DEFAULT_CALIBRATION
from app.depth.pipeline import derive_geometry
from app.contracts import DepthCell


def _cv2():
    """Lazy, guarded cv2 import. Returns the module, or None if unavailable."""
    try:
        import cv2
        return cv2
    except ImportError:
        return None


def disparity(left, right, calib: Calibration) -> np.ndarray:
    """Rectified 8-bit grayscale left/right -> disparity map (px, float32).

    Uses cv2.StereoSGBM tuned by `calib`'s matcher fields. Raises RuntimeError
    (not ImportError) if cv2 isn't installed, since this is only reachable
    from an explicit call, never from importing this module.
    """
    cv2 = _cv2()
    if cv2 is None:
        raise RuntimeError(
            "cv2 not installed - `pip install -r requirements-cv.txt` to run "
            "real stereo matching"
        )
    matcher = cv2.StereoSGBM_create(
        minDisparity=calib.min_disparity,
        numDisparities=calib.num_disparities,
        blockSize=calib.block_size,
        uniquenessRatio=calib.uniqueness_ratio,
        speckleWindowSize=calib.speckle_window_size,
        speckleRange=calib.speckle_range,
        disp12MaxDiff=calib.disp12_max_diff,
        P1=8 * calib.block_size ** 2,
        P2=32 * calib.block_size ** 2,
    )
    # SGBM returns fixed-point disparity (px * 16); convert to real pixels.
    raw = matcher.compute(np.asarray(left), np.asarray(right))
    return raw.astype(np.float32) / 16.0


def disparity_to_depth(disp, calib: Calibration) -> np.ndarray:
    """Disparity map (px) -> metric depth (m), same shape.

    Invalid/occluded/no-match disparity (<=0, below `min_valid_disparity_px`,
    or non-finite) becomes NaN — never a fabricated depth. Downstream scoring
    already treats NaN geometry as unsafe (scores 0), so this is the one place
    that has to get the guard right.
    """
    disp = np.asarray(disp, dtype=np.float32)
    depth = np.full(disp.shape, np.nan, dtype=np.float32)
    valid = np.isfinite(disp) & (disp > calib.min_valid_disparity_px)
    depth[valid] = (calib.baseline_m * calib.focal_px) / disp[valid]
    return depth


def stereo_geometry(left, right, calib: Calibration, cell_size_m: float) -> list[list[DepthCell]]:
    """Rectified stereo pair -> per-cell DepthCell grid.

    disparity -> metric height grid -> the existing, already-tested
    `derive_geometry` for slope/roughness. One pixel == one grid cell here;
    any spatial binning to a coarser terrain grid is a caller/preprocessing
    concern, not this module's.
    """
    disp = disparity(left, right, calib)
    depth = disparity_to_depth(disp, calib)
    heights = depth.tolist()  # np.nan -> python float('nan'), same as the P1 fixture
    return derive_geometry(heights, cell_size_m)


# ---------------------------------------------------------------------------
# Self-check
# ---------------------------------------------------------------------------

def _synthetic_pair(width=64, height=32, k=0.05, base_depth=3.0,
                     calib: Calibration = DEFAULT_CALIBRATION, seed=0):
    """Synthetic rectified pair for a known fronto-parallel-in-y tilted plane:
    depth(x) = base_depth + k*x (metres). Returns (left, right, expected_depth_row).
    """
    rng = np.random.default_rng(seed)
    depth_row = base_depth + k * np.arange(width)
    disp_row = (calib.baseline_m * calib.focal_px) / depth_row
    max_shift = int(np.ceil(disp_row.max())) + 2
    texture = rng.integers(0, 256, size=(height, width + max_shift), dtype=np.uint8)
    left = texture[:, max_shift:max_shift + width]
    right = np.empty_like(left)
    for x in range(width):
        src = max_shift + x - int(round(disp_row[x]))
        right[:, x] = texture[:, src]
    return left, right, depth_row


def _check_invalid_disparity_guard():
    """Pure-numpy guarantee, no cv2 needed: bad disparity -> NaN, never a number."""
    disp = np.array([[10.0, 0.0], [-1.0, float("nan")]], dtype=np.float32)
    depth = disparity_to_depth(disp, DEFAULT_CALIBRATION)
    assert math.isfinite(depth[0, 0]) and depth[0, 0] > 0, depth[0, 0]
    assert all(math.isnan(v) for v in (depth[0, 1], depth[1, 0], depth[1, 1]))


def _check_synthetic_plane(cv2):
    """Full round trip: synthetic tilted-plane stereo pair -> recovered slope
    within tolerance of the known-geometry answer."""
    calib, k, cell_size_m = DEFAULT_CALIBRATION, 0.05, 1.0
    left, right, _ = _synthetic_pair(k=k, calib=calib)
    grid = stereo_geometry(left, right, calib, cell_size_m)
    mid = len(grid) // 2
    slopes = [c.slope_deg for c in grid[mid][10:-10] if math.isfinite(c.slope_deg)]
    assert slopes, "no valid slope recovered from synthetic stereo pair"
    mean_slope = sum(slopes) / len(slopes)
    expected = math.degrees(math.atan(k / cell_size_m))
    assert abs(mean_slope - expected) < 3.0, (mean_slope, expected)


def _demo():
    _check_invalid_disparity_guard()
    cv2 = _cv2()
    if cv2 is None:
        print("skip: cv2 not installed (pip install -r requirements-cv.txt)")
        return
    _check_synthetic_plane(cv2)
    print("stereo self-check ok")


if __name__ == "__main__":
    _demo()
