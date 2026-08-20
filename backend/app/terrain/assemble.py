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


def extract_boundaries(fused: list[FusedCell]) -> list[dict]:
    """One {type, polyline} per feature class present. Cells ordered by (x,y).
    ponytail: coordinate-sort ordering, fine for column/row features; P5 does
    real edge tracing for blobby regions."""
    bounds = []
    for feature in BOUNDARY_CLASSES:
        pts = sorted((f.x, f.y) for f in fused if f.terrain_class == feature)
        if pts:
            bounds.append({"type": feature, "polyline": [[x, y] for x, y in pts]})
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
    assert b == [{"type": "crater", "polyline": [[1, 0]]}], b
    print("terrain self-check ok")


if __name__ == "__main__":
    _demo()
