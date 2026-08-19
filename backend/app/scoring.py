"""Zone classification + construction Safety Score.

Pure rules layer, decoupled from the neural net: geometry (slope/roughness/
crater-distance) still works even when the class label is uncertain. Class only
gates the *final* zone, never the geometric score.
"""
from __future__ import annotations
from dataclasses import dataclass

# tuning knobs — calibrate per dataset (lunar regolith != mars analog)
SLOPE_MAX_DEG = 25.0      # above this: hazardous, no score
SLOPE_SAFE_DEG = 8.0      # below this: full slope credit
ROUGH_MAX = 0.30          # per-cell height stddev (m) considered rough
CRATER_MARGIN_M = 3.0     # keep-out radius from a crater rim
SAFE_THRESHOLD = 0.70     # score >= this -> Zone 0 candidate
CONF_MIN_BUILD = 0.5      # need this class confidence to ever call it buildable

# how much each factor counts toward the score
W_SLOPE, W_ROUGH, W_CLASS, W_CRATER = 0.35, 0.25, 0.20, 0.20

# per-class bearing weight (1.0 = ideal build surface). Covers the full
# segmentation taxonomy so no known class silently uses the .get() default.
# waterbed/mineral_edge are geological (Zone 2) — protected, never built on.
CLASS_BEARING = {"compact_soil": 1.0, "soil": 0.6, "loose_soil": 0.3,
                 "rock": 0.2, "shadow": 0.0, "crater": 0.0,
                 "waterbed": 0.1, "mineral_edge": 0.1, "unknown": 0.4}


@dataclass
class Cell:
    slope_deg: float
    roughness: float
    terrain_class: str
    crater_dist_m: float
    conf: float = 1.0  # segmentation confidence [0,1]


def _lin(x: float, lo: float, hi: float) -> float:
    """1.0 at/below lo, 0.0 at/above hi, linear between. Clamped."""
    if hi <= lo:
        return 1.0 if x <= lo else 0.0
    return max(0.0, min(1.0, (hi - x) / (hi - lo)))


def safety_score(c: Cell) -> float:
    """Weighted construction viability in [0, 1]. Geometry-driven."""
    slope_f = _lin(c.slope_deg, SLOPE_SAFE_DEG, SLOPE_MAX_DEG)
    rough_f = _lin(c.roughness, 0.05, ROUGH_MAX)
    crater_f = 1.0 if c.crater_dist_m >= CRATER_MARGIN_M else \
        c.crater_dist_m / CRATER_MARGIN_M
    class_f = CLASS_BEARING.get(c.terrain_class, 0.4)
    # low-confidence class shrinks toward neutral 0.4 so it can't force Zone 0
    class_f = 0.4 + (class_f - 0.4) * c.conf
    return round(W_SLOPE * slope_f + W_ROUGH * rough_f
                 + W_CLASS * class_f + W_CRATER * crater_f, 3)


def zone(c: Cell) -> int:
    """0 safe, 1 nav, 2 geological, 3 hazard. Precedence: hazard>geo>nav>safe."""
    # Zone 3 — hazard, highest precedence. Parenthesized so intent is explicit.
    if (c.slope_deg >= SLOPE_MAX_DEG
            or c.crater_dist_m < CRATER_MARGIN_M
            or c.terrain_class == "crater"                       # a crater is always hazard
            or (c.terrain_class == "rock" and c.roughness >= ROUGH_MAX)):  # boulder
        return 3
    # Zone 2 — geological interest.
    if c.terrain_class in ("waterbed", "mineral_edge"):
        return 2
    # Zone 0 — construction-safe. Needs a confident buildable class AND score.
    if (safety_score(c) >= SAFE_THRESHOLD and c.conf >= CONF_MIN_BUILD
            and c.terrain_class in ("compact_soil", "soil")):
        return 0
    # Zone 1 — navigation-only (default for anything drivable but not buildable).
    return 1


def _demo():
    flat = Cell(3, 0.02, "compact_soil", 10)
    rim = Cell(30, 0.4, "crater", 0.5)
    loose = Cell(6, 0.1, "loose_soil", 8)
    uncertain = Cell(3, 0.02, "compact_soil", 10, conf=0.2)
    smooth_crater = Cell(4, 0.03, "crater", 12)   # flat-looking crater floor, far from a rim
    boulder = Cell(5, 0.5, "rock", 9)             # big rough rock = hazard
    small_rock = Cell(5, 0.1, "rock", 9)          # small rock = drivable
    waterbed = Cell(3, 0.02, "waterbed", 10)      # geological
    steep_waterbed = Cell(30, 0.5, "waterbed", 9) # hazard beats geological (precedence)
    shadow = Cell(3, 0.02, "shadow", 10)          # unknown-ish, never buildable

    assert safety_score(flat) > 0.85, safety_score(flat)
    assert zone(flat) == 0
    assert zone(rim) == 3
    assert zone(loose) == 1                        # drivable, not buildable
    # low-confidence class must NOT get promoted to Zone 0
    assert zone(uncertain) == 1, zone(uncertain)
    assert safety_score(uncertain) < safety_score(flat)
    # crater is always hazard even when it looks smooth
    assert zone(smooth_crater) == 3, zone(smooth_crater)
    assert zone(boulder) == 3, zone(boulder)
    assert zone(small_rock) == 1, zone(small_rock)
    assert zone(waterbed) == 2, zone(waterbed)
    assert zone(steep_waterbed) == 3, zone(steep_waterbed)   # precedence: hazard > geological
    assert zone(shadow) == 1, zone(shadow)         # drivable-with-caution, not buildable
    # every segmentation class has an explicit bearing weight (no silent default)
    taxonomy = {"compact_soil", "soil", "loose_soil", "rock", "crater",
                "shadow", "waterbed", "mineral_edge", "unknown"}
    assert taxonomy <= set(CLASS_BEARING), taxonomy - set(CLASS_BEARING)
    print("scoring self-check ok")


if __name__ == "__main__":
    _demo()
