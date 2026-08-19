"""Regenerate backend/mock/*.json so tiles/sites are consistent with scoring.py.

Run: python gen_mock.py   (from backend/)
Also asserts the emitted rows match the frozen API contract shape.
"""
import json
from pathlib import Path
from app.scoring import Cell, safety_score, zone

MOCK = Path(__file__).resolve().parent / "mock"

# representative fused cells across a survey strip (slope, roughness, class, crater_dist, conf)
CELLS = [
    (0, 0, Cell(3.1, 0.02, "compact_soil", 10.0)),
    (1, 0, Cell(6.4, 0.06, "soil", 8.0)),
    (2, 0, Cell(9.2, 0.12, "loose_soil", 7.0)),
    (3, 0, Cell(31.0, 0.40, "crater", 0.5)),       # crater rim
    (4, 0, Cell(4.0, 0.05, "mineral_edge", 6.0)),  # geological
    (5, 0, Cell(5.0, 0.50, "rock", 9.0)),          # boulder -> hazard
    (2, 1, Cell(3.0, 0.03, "compact_soil", 12.0)),
]


def build_tiles():
    tiles = []
    for x, y, c in CELLS:
        tiles.append({"x": x, "y": y, "z": round(c.slope_deg / 20, 2),
                      "class": c.terrain_class, "slope": c.slope_deg,
                      "safety_score": safety_score(c), "zone": zone(c)})
    return tiles


def build_sites(tiles):
    buildable = [t for t in tiles if t["zone"] == 0]
    buildable.sort(key=lambda t: t["safety_score"], reverse=True)
    return [{"id": f"S{i+1}", "x": t["x"], "y": t["y"],
             "safety_score": t["safety_score"], "rank": i + 1}
            for i, t in enumerate(buildable)]


def _check_shape(tiles, sites):
    tkeys = {"x", "y", "z", "class", "slope", "safety_score", "zone"}
    skeys = {"id", "x", "y", "safety_score", "rank"}
    assert tiles and all(set(t) == tkeys for t in tiles), "tile contract drift"
    assert all(set(s) == skeys for s in sites), "site contract drift"
    assert all(0 <= t["zone"] <= 3 for t in tiles)
    assert any(t["zone"] == 0 for t in tiles), "expected at least one buildable tile"
    assert any(t["zone"] == 3 for t in tiles), "expected at least one hazard tile"


def main():
    tiles = build_tiles()
    sites = build_sites(tiles)
    _check_shape(tiles, sites)
    (MOCK / "tiles.json").write_text(json.dumps(tiles, indent=2) + "\n")
    (MOCK / "sites.json").write_text(json.dumps(sites, indent=2) + "\n")
    print(f"mock regenerated: {len(tiles)} tiles, {len(sites)} sites (contract ok)")


if __name__ == "__main__":
    main()
