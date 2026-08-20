"""SLAM fusion — single-frame passthrough (P1).

Combines the aligned segmentation and depth grids into one world-aligned list of
FusedCell, keyed by grid (x,y). P1 is a single frame: world coords == grid indices
(+ origin). P4 replaces this with real pose estimation + multi-frame grid fusion
and a derived rover_path; the FusedCell output shape stays the same.
Pure stdlib.
"""
from __future__ import annotations
from app.contracts import FusedCell


def fuse_single(seg_grid, depth_grid, origin=(0, 0)) -> list[FusedCell]:
    """seg_grid[y][x], depth_grid[y][x] -> flat list of FusedCell."""
    ox, oy = origin
    cells: list[FusedCell] = []
    for y, (seg_row, dep_row) in enumerate(zip(seg_grid, depth_grid)):
        for x, (sc, dc) in enumerate(zip(seg_row, dep_row)):
            cells.append(FusedCell(x + ox, y + oy, dc.height, dc.slope_deg,
                                   dc.roughness, sc.terrain_class, sc.conf))
    return cells


def placeholder_path() -> list[dict]:
    """Short deterministic traverse across the safe pad.
    ponytail: single-frame slice has no real trajectory — P4 derives this from
    SLAM pose over a frame sequence."""
    return [
        {"t": 0, "x": 0, "y": 0, "heading": 90, "mode": "full"},
        {"t": 1, "x": 1, "y": 0, "heading": 90, "mode": "full"},
        {"t": 2, "x": 1, "y": 1, "heading": 45, "mode": "cautious"},
    ]


def _demo():
    from app.contracts import SegCell, DepthCell
    seg = [[SegCell("compact_soil", 0.6), SegCell("crater", 0.6)]]
    dep = [[DepthCell(0.2, 1.0, 0.01), DepthCell(-1.0, 30.0, 0.4)]]
    cells = fuse_single(seg, dep)
    assert len(cells) == 2 and cells[0].x == 0 and cells[1].x == 1, cells
    assert cells[0].terrain_class == "compact_soil" and cells[0].height == 0.2
    assert {p["t"] for p in placeholder_path()} == {0, 1, 2}
    print("fusion self-check ok")


if __name__ == "__main__":
    _demo()
