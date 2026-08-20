"""P1 — end-to-end vertical slice.

Runs the full pipeline on scene_0 and asserts the output is contract-valid,
exercises all four zones, and — critically — introduces NO false-safe path:
no hazard-class or crater-keep-out cell may come out Zone 0.

Runnable two ways:
    python backend/tests/test_pipeline.py
    pytest backend/tests
"""
from __future__ import annotations
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.pipeline import run                                   # noqa: E402
from app.scoring import CLASS_BEARING, SAFE_THRESHOLD          # noqa: E402

TILE_KEYS = {"x", "y", "z", "class", "slope", "safety_score", "zone"}
OUT = run("scene_0")
TILES = OUT["tiles"]


def _tile(x, y):
    return next(t for t in TILES if t["x"] == x and t["y"] == y)


def test_tiles_contract_shape():
    assert TILES, "no tiles produced"
    for t in TILES:
        assert set(t) == TILE_KEYS, f"tile key drift: {set(t) ^ TILE_KEYS}"
        assert t["zone"] in (0, 1, 2, 3)
        assert 0.0 <= t["safety_score"] <= 1.0
        assert t["class"] in CLASS_BEARING


def test_all_zones_present():
    assert {t["zone"] for t in TILES} == {0, 1, 2, 3}, "slice must exercise all zones"


def test_known_cells():
    assert _tile(0, 0)["zone"] == 0 and _tile(0, 0)["class"] == "compact_soil"
    assert _tile(4, 0)["zone"] == 3 and _tile(4, 0)["class"] == "crater"
    assert _tile(7, 0)["zone"] == 2 and _tile(7, 0)["class"] == "mineral_edge"
    assert _tile(8, 0)["zone"] == 1


def test_no_false_safe():
    # a crater cell can NEVER be Zone 0, whatever its score
    assert all(t["zone"] != 0 for t in TILES if t["class"] == "crater")
    # a Zone-0 tile must be a genuinely buildable class above the safe threshold
    for t in TILES:
        if t["zone"] == 0:
            assert t["class"] in ("compact_soil", "soil"), t
            assert t["safety_score"] >= SAFE_THRESHOLD, t
    # a cell inside the crater keep-out (2m from the crater column) is not safe,
    # even though its raw score is high — decision layer overrides geometry
    keepout = _tile(2, 0)
    assert keepout["zone"] == 3 and keepout["safety_score"] > SAFE_THRESHOLD, keepout


def test_boundaries_and_sites():
    types = {b["type"] for b in OUT["boundaries"]}
    assert "crater" in types, OUT["boundaries"]
    for b in OUT["boundaries"]:
        assert set(b) == {"type", "polyline"} and b["polyline"]
    for s in OUT["sites"]:
        assert set(s) == {"id", "x", "y", "safety_score", "rank"}
    # every site corresponds to a Zone-0 tile
    zone0 = {(t["x"], t["y"]) for t in TILES if t["zone"] == 0}
    assert all((s["x"], s["y"]) in zone0 for s in OUT["sites"])


if __name__ == "__main__":
    test_tiles_contract_shape()
    test_all_zones_present()
    test_known_cells()
    test_no_false_safe()
    test_boundaries_and_sites()
    print("pipeline ok")
