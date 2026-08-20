"""P0 — synthetic fixture integrity + internal-contract round-trip.

Validates that scene_0 is well-formed and flows through the stage handoffs
(segmentation -> depth -> fusion -> terrain) into valid scoring.Cell inputs,
independent of the decision outcome (that's test_pipeline's job).

Runnable two ways:
    python backend/tests/test_fixtures.py
    pytest backend/tests
"""
from __future__ import annotations
import json
import math
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.perception.segment import segment, CLASS_COLORS      # noqa: E402
from app.depth.pipeline import derive_geometry                # noqa: E402
from app.slam.fuse import fuse_single                          # noqa: E402
from app.terrain.assemble import build_cells                   # noqa: E402
from app.scoring import CLASS_BEARING                          # noqa: E402

SCENE = json.loads((Path(__file__).resolve().parent.parent
                    / "mock/fixtures/scene_0/scene.json").read_text())
TAXONOMY = set(CLASS_BEARING)


def test_scene_schema():
    assert set(SCENE) >= {"cell_size_m", "rows", "cols", "heights", "rgb"}
    assert SCENE["cell_size_m"] > 0
    for grid in (SCENE["heights"], SCENE["rgb"]):
        assert len(grid) == SCENE["rows"], "row count mismatch"
        assert all(len(row) == SCENE["cols"] for row in grid), "col count mismatch"
    for row in SCENE["rgb"]:
        for px in row:
            assert len(px) == 3 and all(0 <= v <= 255 for v in px), px


def test_segmentation_in_taxonomy():
    for row in segment(SCENE["rgb"]):
        for sc in row:
            assert sc.terrain_class in TAXONOMY, sc
            assert 0.0 <= sc.conf <= 1.0, sc


def test_roundtrip_to_valid_cells():
    seg = segment(SCENE["rgb"])
    depth = derive_geometry(SCENE["heights"], SCENE["cell_size_m"])
    fused = fuse_single(seg, depth)
    assert len(fused) == SCENE["rows"] * SCENE["cols"]
    cells = build_cells(fused, SCENE["cell_size_m"])
    assert len(cells) == len(fused)
    for x, y, cell, height in cells:
        assert cell.terrain_class in TAXONOMY
        assert 0.0 <= cell.conf <= 1.0
        assert math.isfinite(cell.slope_deg) and cell.slope_deg >= 0.0
        assert math.isfinite(cell.roughness) and cell.roughness >= 0.0
        assert math.isfinite(cell.crater_dist_m) and cell.crater_dist_m >= 0.0
        assert math.isfinite(height)


if __name__ == "__main__":
    test_scene_schema()
    test_segmentation_in_taxonomy()
    test_roundtrip_to_valid_cells()
    print("fixtures ok")
