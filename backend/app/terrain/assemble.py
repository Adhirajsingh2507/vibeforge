"""Terrain assembly — fused grid -> scoring.Cell + boundary polylines.

Measurement side only: builds Cell inputs (including crater_dist_m, computed here
from crater-classified cells) and traces feature-class boundaries. It does NOT
call zone()/safety_score() — the runner (pipeline.py) does that, keeping the
measurement -> decision boundary clean.

crater_dist_m = Euclidean distance (in metres) to the nearest crater cell; a
crater cell is 0.0; with no crater cells it's a large finite number (NOT inf,
which scoring treats as invalid and scores 0). P5 deepens rim detection and
polyline tracing; the output shapes stay the same. Pure stdlib.
"""
from __future__ import annotations
from app.contracts import FusedCell
from app.scoring import Cell

NO_CRATER_DIST = 1.0e6          # finite "far": crater factor = full credit
BOUNDARY_CLASSES = ("crater", "waterbed", "mineral_edge")


def _crater_dist_m(fc: FusedCell, crater_xy, cell_size_m: float) -> float:
    if not crater_xy:
        return NO_CRATER_DIST
    d2 = min((fc.x - cx) ** 2 + (fc.y - cy) ** 2 for cx, cy in crater_xy)
    return (d2 ** 0.5) * cell_size_m


def build_cells(fused: list[FusedCell], cell_size_m: float):
    """-> list of (x, y, Cell, height). height is passed through for tile `z`."""
    crater_xy = [(f.x, f.y) for f in fused if f.terrain_class == "crater"]
    out = []
    for f in fused:
        cell = Cell(f.slope_deg, f.roughness, f.terrain_class,
                    _crater_dist_m(f, crater_xy, cell_size_m), f.conf)
        out.append((f.x, f.y, cell, f.height))
    return out


_FOUR = ((1, 0), (-1, 0), (0, 1), (0, -1))


def _border_cells(region: set[tuple[int, int]]) -> list[tuple[int, int]]:
    """Region cells with >=1 4-neighbor outside the region -- the actual rim
    cells, not interior fill. A fully enclosed region (no cell touches the
    outside) falls back to every cell, degenerate but still valid."""
    border = [p for p in region
              if any((p[0] + dx, p[1] + dy) not in region for dx, dy in _FOUR)]
    return border or list(region)


def _walk_border(border: list[tuple[int, int]]) -> list[list[int]]:
    """Greedy nearest-neighbor walk over border cells: real adjacency-based
    tracing, not a coordinate sort -- follows the region's edge, stepping to
    the closest unvisited border cell each hop (so a rim/blob is walked
    around its perimeter). Disjoint components of the same class (e.g. two
    craters) are stitched by hopping to the nearest remaining cell.
    ponytail: O(n^2) greedy scan, fine for per-scene terrain grids; swap for
    a KD-tree or full contour walk if grids grow into the thousands of cells."""
    remaining = set(border)
    start = min(remaining, key=lambda p: (p[1], p[0]))  # topmost, then leftmost
    remaining.discard(start)
    path = [start]
    cur = start
    while remaining:
        nxt = min(remaining, key=lambda p: (p[0] - cur[0]) ** 2 + (p[1] - cur[1]) ** 2)
        remaining.discard(nxt)
        path.append(nxt)
        cur = nxt
    return [[x, y] for x, y in path]


def extract_boundaries(fused: list[FusedCell]) -> list[dict]:
    """One {type, polyline} per feature class present. polyline walks the
    region's border cells by adjacency (see _walk_border), so blobby/concave
    rim shapes trace correctly, not just rows/columns."""
    bounds = []
    for feature in BOUNDARY_CLASSES:
        region = {(f.x, f.y) for f in fused if f.terrain_class == feature}
        if region:
            bounds.append({"type": feature, "polyline": _walk_border(_border_cells(region))})
    return bounds


def _demo():
    from app.scoring import zone
    # a crater cell and a far cell; crater_dist 0 at the crater, positive elsewhere
    fused = [
        FusedCell(0, 0, 0.2, 2.0, 0.02, "compact_soil", 0.6),
        FusedCell(1, 0, -1.0, 5.0, 0.1, "crater", 0.6),
    ]
    cells = build_cells(fused, cell_size_m=2.0)
    by_xy = {(x, y): c for x, y, c, _ in cells}
    assert by_xy[(1, 0)].crater_dist_m == 0.0, by_xy[(1, 0)]
    assert by_xy[(0, 0)].crater_dist_m == 2.0, by_xy[(0, 0)]   # 1 cell * 2 m
    assert zone(by_xy[(1, 0)]) == 3                            # crater = hazard
    # no crater cells -> finite far distance (not inf), so scoring stays valid
    solo = build_cells([FusedCell(0, 0, 0.2, 2.0, 0.02, "soil", 0.6)], 1.0)
    assert solo[0][2].crater_dist_m == NO_CRATER_DIST
    b = extract_boundaries(fused)
    assert b == [{"type": "crater", "polyline": [[1, 0]]}], b  # single-cell region

    # multi-cell blobby region: hollow 3x3 ring (a crude crater rim) -- must
    # trace the perimeter by adjacency, not emit a coordinate sort.
    ring = [(0, 0), (1, 0), (2, 0), (0, 1), (2, 1), (0, 2), (1, 2), (2, 2)]
    ring_fused = [FusedCell(x, y, 0.0, 30.0, 0.3, "crater", 0.9) for x, y in ring]
    ring_b = extract_boundaries(ring_fused)
    assert len(ring_b) == 1 and ring_b[0]["type"] == "crater"
    poly = ring_b[0]["polyline"]
    assert len(poly) == len(ring) and {tuple(p) for p in poly} == set(ring)  # every rim cell, once
    assert poly != sorted(ring)  # real tracing, not the old coordinate-sort placeholder
    for (x0, y0), (x1, y1) in zip(poly, poly[1:]):
        assert max(abs(x0 - x1), abs(y0 - y1)) == 1  # each hop lands on an 8-neighbor

    _assert_no_scoring_calls()
    print("terrain self-check ok")


def _assert_no_scoring_calls():
    """Self-check: build_cells/extract_boundaries must never call zone()/
    safety_score() -- deciding is the runner's job, not assembly's."""
    import app.scoring as scoring_mod
    calls = []
    real_zone, real_score = scoring_mod.zone, scoring_mod.safety_score
    scoring_mod.zone = lambda *a, **k: calls.append(1) or real_zone(*a, **k)
    scoring_mod.safety_score = lambda *a, **k: calls.append(1) or real_score(*a, **k)
    try:
        fused = [FusedCell(0, 0, 0.2, 2.0, 0.02, "compact_soil", 0.6),
                 FusedCell(1, 0, -1.0, 5.0, 0.1, "crater", 0.6)]
        build_cells(fused, cell_size_m=1.0)
        extract_boundaries(fused)
    finally:
        scoring_mod.zone, scoring_mod.safety_score = real_zone, real_score
    assert not calls, "assembly must not call scoring"


if __name__ == "__main__":
    _demo()
