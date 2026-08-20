"""Segmentation stub — classical nearest-colour classifier.

P1 stand-in for the trained U-Net (torch stays out of the deployed backend).
Maps each RGB cell to the nearest class-colour centroid and emits a CONSERVATIVE
confidence: capped at CONF_CAP because a heuristic is not a trained net, low when
the match is ambiguous, and `unknown` when far from every centroid. This keeps
the no-false-safe invariant intact — scoring degrades low conf toward neutral, so
an honest low confidence here can never force a buildable zone downstream.

Real segmentation (P3) replaces `classify` while keeping the (class, conf) output.
Pure stdlib.
"""
from __future__ import annotations
from app.contracts import SegCell

# class-colour centroids (RGB), well separated so a clean cell recovers its class.
# Covers the buildable/geological/hazard-relevant taxonomy; `unknown` is the
# far-from-everything fallback, not a centroid.
CLASS_COLORS = {
    "compact_soil": (210, 200, 170),
    "soil":         (140, 110, 80),
    "loose_soil":   (190, 165, 110),
    "rock":         (110, 110, 120),
    "crater":       (80, 40, 30),
    "shadow":       (20, 20, 25),
    "waterbed":     (70, 120, 175),
    "mineral_edge": (60, 150, 110),
}
CONF_CAP = 0.6        # a heuristic never claims more certainty than this
CONF_FLOOR = 0.2      # a made match still isn't zero-confidence
UNKNOWN_DIST = 90.0   # farther than this from any centroid -> unknown


def _dist2(a, b) -> float:
    return sum((p - q) ** 2 for p, q in zip(a, b))


def classify(rgb) -> SegCell:
    """One RGB triple -> (class, conf). Conservative by construction."""
    ranked = sorted(CLASS_COLORS.items(), key=lambda kv: _dist2(rgb, kv[1]))
    (c1, _), d1 = ranked[0], _dist2(rgb, ranked[0][1]) ** 0.5
    if d1 > UNKNOWN_DIST:
        return SegCell("unknown", CONF_FLOOR)
    d2 = _dist2(rgb, ranked[1][1]) ** 0.5
    margin = 0.0 if d2 == 0 else max(0.0, (d2 - d1) / d2)   # [0,1], 1 = unambiguous
    conf = round(min(CONF_CAP, CONF_FLOOR + CONF_CAP * margin), 3)
    return SegCell(c1, conf)


def segment(rgb_grid) -> list[list[SegCell]]:
    """rgb_grid[y][x] = (r,g,b) -> grid[y][x] of SegCell."""
    return [[classify(px) for px in row] for row in rgb_grid]


def _demo():
    valid = set(CLASS_COLORS) | {"unknown"}
    # exact centroids recover their class with usable (>=0.5) confidence
    for name, rgb in CLASS_COLORS.items():
        sc = classify(rgb)
        assert sc.terrain_class == name, (name, sc)
        assert 0.5 <= sc.conf <= CONF_CAP, sc
    # off-gamut colour -> unknown, low conf; every output is in-taxonomy & [0,1]
    far = classify((0, 255, 0))
    assert far.terrain_class == "unknown" and far.conf == CONF_FLOOR, far
    grid = segment([[CLASS_COLORS["compact_soil"], (0, 255, 0)]])
    for row in grid:
        for sc in row:
            assert sc.terrain_class in valid and 0.0 <= sc.conf <= 1.0, sc
    print("segmentation self-check ok")


if __name__ == "__main__":
    _demo()
