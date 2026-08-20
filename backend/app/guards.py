"""Trust-boundary input gates for the TerraSight perception ingest.

Run these before building a scoring.Cell: reject data we must not trust
(stale frames, off-grid coordinates, missing depth) and drop to degraded mode
when sensor quality falls. Pure, dependency-free, deterministic — same policy
family as scoring.py.

Thresholds are calibration knobs (mission clock rate, world-grid extent,
sensor SNR/coverage), not constants — tune per rover and dataset.
"""
from __future__ import annotations
import math

MAX_AGE_S = 5.0                       # frame older than this is stale
GRID_MIN_M, GRID_MAX_M = -1000.0, 1000.0  # world-grid extent per axis (m)
SENSOR_QUALITY_MIN = 0.4              # below this SNR/coverage -> degraded mode


def is_stale(ts: float, now: float, max_age_s: float = MAX_AGE_S) -> bool:
    """True if the frame is too old, from the future, or non-finite."""
    if not (math.isfinite(ts) and math.isfinite(now)):
        return True
    return ts > now or (now - ts) > max_age_s


def valid_coord(x: float, y: float,
                lo: float = GRID_MIN_M, hi: float = GRID_MAX_M) -> bool:
    """True only if both coords are finite and inside the world grid."""
    return all(math.isfinite(v) and lo <= v <= hi for v in (x, y))


def has_depth(z: float | None) -> bool:
    """False when depth is missing/NaN — such a cell must never be trusted."""
    return z is not None and math.isfinite(z)


def degraded(sensor_quality: float, floor: float = SENSOR_QUALITY_MIN) -> bool:
    """True when sensor quality is below floor (or unreadable): degraded mode."""
    return not math.isfinite(sensor_quality) or sensor_quality < floor
