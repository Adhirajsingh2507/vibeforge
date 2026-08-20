"""TerraSight safety regression tests.

Locks the false-safe invariants: no configuration of terrain/geometry/sensor
input may reach a construction-safe verdict (Zone 0 / high safety_score) when
it must not. Sweeps ranges rather than single points so a threshold tweak that
reopens a false-safe fails here.

Runnable two ways:
    python backend/tests/test_safety_regression.py     # plain asserts
    pytest backend/tests                               # collected as test_*
"""
from __future__ import annotations
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app import guards                                    # noqa: E402
from app.scoring import (Cell, zone, safety_score,        # noqa: E402
                         SLOPE_MAX_DEG, ROUGH_MAX, CRATER_MARGIN_M,
                         CONF_MIN_BUILD, SAFE_THRESHOLD)

NAN = float("nan")


# --- 1. crater terrain cannot become Zone 0 --------------------------------
def test_crater_never_zone0():
    # even flat, dry, far-from-rim, fully confident crater floor stays hazard
    for slope in (0, 3, 8):
        for rough in (0.0, 0.1):
            for dist in (5, 20, 100):
                c = Cell(slope, rough, "crater", dist, conf=1.0)
                assert zone(c) != 0, c


# --- 2. steep terrain cannot become Zone 0 ---------------------------------
def test_steep_never_zone0():
    for slope in (SLOPE_MAX_DEG, SLOPE_MAX_DEG + 1, 45, 89):
        c = Cell(slope, 0.02, "compact_soil", 50, conf=1.0)
        assert zone(c) != 0, c


# --- 3. low segmentation confidence cannot become Zone 0 -------------------
def test_low_confidence_never_zone0():
    ideal = Cell(2, 0.02, "compact_soil", 50, conf=1.0)
    assert zone(ideal) == 0, "control: an ideal confident cell IS Zone 0"
    lo = CONF_MIN_BUILD - 1e-9
    for conf in (0.0, 0.1, 0.3, lo):
        c = Cell(2, 0.02, "compact_soil", 50, conf=conf)
        assert zone(c) != 0, c
        # and uncertainty degrades the score toward neutral, never inflates it
        assert safety_score(c) <= safety_score(ideal), c


# --- 4. missing depth cannot be treated as safe ----------------------------
def test_missing_depth_not_safe():
    # missing depth => NaN geometry. Must not earn Zone 0 or a passing score.
    for cls in ("compact_soil", "soil"):
        c = Cell(NAN, NAN, cls, NAN, conf=1.0)
        assert zone(c) != 0, c
        assert not safety_score(c) >= SAFE_THRESHOLD, safety_score(c)
    # and the ingest gate rejects missing depth outright
    assert guards.has_depth(1.2) is True
    assert guards.has_depth(None) is False
    assert guards.has_depth(NAN) is False


# --- 5. excessive roughness cannot become Zone 0 ---------------------------
def test_excessive_roughness_never_zone0():
    # perfect slope/class/distance but boulder-field roughness -> not buildable
    for rough in (ROUGH_MAX, ROUGH_MAX + 0.1, 1.0):
        for cls in ("compact_soil", "soil"):
            c = Cell(2, rough, cls, 50, conf=1.0)
            assert zone(c) != 0, c


# --- 6. unsafe crater distance cannot become Zone 0 ------------------------
def test_unsafe_crater_distance_never_zone0():
    for dist in (0.0, 0.5, CRATER_MARGIN_M - 1e-9):
        c = Cell(2, 0.02, "compact_soil", dist, conf=1.0)
        assert zone(c) == 3, c   # inside keep-out is an outright hazard


# --- 7. conflicting terrain classification resolves conservatively ---------
def test_conflicting_classification_conservative():
    # two heads disagree soil-vs-crater. Low fused confidence must NOT build,
    # and taking the hazardous reading must win over the benign one.
    ambiguous = Cell(2, 0.02, "compact_soil", 50, conf=0.3)
    assert zone(ambiguous) != 0, "ambiguous class must not be buildable"
    hazard_reading = Cell(2, 0.02, "crater", 50, conf=0.6)
    assert zone(hazard_reading) == 3, "conservative pick keeps the hazard"


# --- 8. stale timestamps are rejected --------------------------------------
def test_stale_timestamp_rejected():
    now = 100.0
    assert guards.is_stale(now - guards.MAX_AGE_S - 0.01, now) is True
    assert guards.is_stale(now + 1, now) is True        # future frame
    assert guards.is_stale(NAN, now) is True
    assert guards.is_stale(now - 1, now) is False        # fresh


# --- 9. invalid coordinates are rejected -----------------------------------
def test_invalid_coordinates_rejected():
    assert guards.valid_coord(0, 0) is True
    assert guards.valid_coord(guards.GRID_MAX_M + 1, 0) is False
    assert guards.valid_coord(0, guards.GRID_MIN_M - 1) is False
    assert guards.valid_coord(NAN, 0) is False
    assert guards.valid_coord(0, math.inf) is False


# --- 10. sensor-quality failure activates degraded mode --------------------
def test_sensor_failure_activates_degraded_mode():
    assert guards.degraded(guards.SENSOR_QUALITY_MIN - 0.01) is True
    assert guards.degraded(0.0) is True
    assert guards.degraded(NAN) is True
    assert guards.degraded(0.9) is False


def _run():
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("safety regression: all invariants hold")


if __name__ == "__main__":
    _run()
