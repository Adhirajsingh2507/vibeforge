"""Segmentation — classical HSV + Lab-ish colour classifier with a local-texture
confidence gate (P3, replaces the P1 nearest-RGB stub). torch stays OUT of the
deployed backend; this is numpy + stdlib colour math only.

Pipeline:
    classify(rgb)       per-pixel: HSV + luminance/opponent-colour features vs.
                         class-colour centroids -> (class, conservative conf).
    segment(rgb_grid)   classify() every cell, then use numpy to measure local
                         (3x3) brightness variance ("texture"). A cell whose own
                         colour match was ALREADY ambiguous (weak margin, low
                         conf) sitting in a high-texture neighbourhood gets
                         pushed further down to `unknown` -- a genuinely mixed
                         or noisy patch must not be reported as a confident
                         guess. A cell classify() was confident about is never
                         overridden by texture alone.

This keeps the no-false-safe invariant: scoring degrades low conf toward
neutral (0.4), so an honestly low/unknown label here can never force a
buildable zone downstream.
"""
from __future__ import annotations
import colorsys
from pathlib import Path

import numpy as np

from app.contracts import SegCell

# class-colour centroids (RGB), well separated so a clean cell recovers its
# class. `unknown` is the far-from-everything fallback, not a centroid.
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

CONF_CAP = 0.6          # a heuristic never claims more certainty than this
CONF_FLOOR = 0.2        # a made match still isn't zero-confidence
UNKNOWN_DIST = 0.35     # farther than this (feature space) from any centroid -> unknown
AMBIGUOUS_CONF = 0.4    # below this, a cell's own colour match was already weak
SHADOW_MAX_RGB = 30     # near/pure-black is unambiguously shadow, no centroid needed
TEXTURE_AMBIGUOUS = 20.0  # 3x3 luminance stddev (0-255) treated as a "mixed/noisy patch"
# ponytail: TEXTURE_AMBIGUOUS is a heuristic knob tuned by eye against scene_0's
# noise floor, not calibrated data. Recalibrate against real rover imagery in P6.


def _features(rgb) -> tuple[float, float, float, float, float, float]:
    """RGB -> (h, s, v, luminance, opponent r-g, opponent g-b): HSV plus a
    cheap Lab-like opponent-colour space, all roughly [-1, 1]-ish scale so an
    unweighted Euclidean distance is meaningful without extra tuning."""
    r, g, b = (c / 255.0 for c in rgb)
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    return (h, s, v, lum, r - g, g - b)


CENTROID_FEATURES = {name: _features(rgb) for name, rgb in CLASS_COLORS.items()}


def _dist(a, b) -> float:
    return sum((p - q) ** 2 for p, q in zip(a, b)) ** 0.5


def classify(rgb) -> SegCell:
    """One RGB triple -> (class, conf). Conservative by construction."""
    if max(rgb) <= SHADOW_MAX_RGB:
        return SegCell("shadow", CONF_CAP)
    f = _features(rgb)
    ranked = sorted(CENTROID_FEATURES.items(), key=lambda kv: _dist(f, kv[1]))
    c1, f1 = ranked[0]
    d1 = _dist(f, f1)
    if d1 > UNKNOWN_DIST:
        return SegCell("unknown", CONF_FLOOR)
    d2 = _dist(f, ranked[1][1])
    margin = 0.0 if d2 == 0 else max(0.0, (d2 - d1) / d2)   # [0,1], 1 = unambiguous
    conf = round(min(CONF_CAP, CONF_FLOOR + CONF_CAP * margin), 3)
    return SegCell(c1, conf)


def segment(rgb_grid) -> list[list[SegCell]]:
    """rgb_grid[y][x] = (r,g,b) -> grid[y][x] of SegCell, with a local-texture
    confidence gate on top of per-pixel classify()."""
    base = [[classify(px) for px in row] for row in rgb_grid]
    gray = np.asarray(rgb_grid, dtype=np.float64).mean(axis=2)  # (rows, cols) luminance
    padded = np.pad(gray, 1, mode="edge")
    rows, cols = gray.shape
    out: list[list[SegCell]] = [[None] * cols for _ in range(rows)]  # type: ignore[list-item]
    for y in range(rows):
        for x in range(cols):
            sc = base[y][x]
            texture = float(padded[y:y + 3, x:x + 3].std())
            if texture >= TEXTURE_AMBIGUOUS and sc.conf < AMBIGUOUS_CONF and sc.terrain_class != "shadow":
                sc = SegCell("unknown", CONF_FLOOR)
            out[y][x] = sc
    return out


def _demo():
    valid = set(CLASS_COLORS) | {"unknown"}

    # exact centroids recover their class with usable (>=0.5) confidence
    for name, rgb in CLASS_COLORS.items():
        sc = classify(rgb)
        assert sc.terrain_class == name, (name, sc)
        assert 0.5 <= sc.conf <= CONF_CAP, sc

    # pure/near-black -> shadow, never a guess
    black = classify((0, 0, 0))
    assert black.terrain_class == "shadow" and black.conf == CONF_CAP, black

    # off-gamut colour -> unknown, low conf
    far = classify((0, 255, 0))
    assert far.terrain_class == "unknown" and far.conf == CONF_FLOOR, far

    # a blend halfway between two centroids is ambiguous -> never overconfident
    blend = tuple((a + b) // 2 for a, b in zip(CLASS_COLORS["soil"], CLASS_COLORS["loose_soil"]))
    amb = classify(blend)
    assert amb.conf < AMBIGUOUS_CONF, amb

    # segment() output stays in-taxonomy and conf in [0,1]
    grid = segment([[CLASS_COLORS["compact_soil"], (0, 255, 0)]])
    for row in grid:
        for sc in row:
            assert sc.terrain_class in valid and 0.0 <= sc.conf <= 1.0, sc

    # scene_0 fixture: every asserted cell recovers its intended class
    scene_path = Path(__file__).resolve().parent.parent.parent / "mock/fixtures/scene_0/scene.json"
    import json
    scene = json.loads(scene_path.read_text())
    seg = segment(scene["rgb"])
    for row in seg:
        for sc in row:
            assert sc.terrain_class in valid and 0.0 <= sc.conf <= 1.0, sc
    expected = {
        (0, 0): "compact_soil",
        (4, 0): "crater",
        (7, 0): "mineral_edge",
        (8, 0): "loose_soil",
        (8, 1): "rock",
        (8, 2): "shadow",
    }
    for (x, y), cls in expected.items():
        got = seg[y][x].terrain_class
        assert got == cls, f"({x},{y}) expected {cls}, got {got}"

    print("segmentation self-check ok")


if __name__ == "__main__":
    _demo()
