"""End-to-end perception pipeline runner (P1 vertical slice).

Threads every stage together on a fixture scene and emits the frozen API
contract, replacing gen_mock.py's hand-authored Cell literals with a real
computed flow:

    scene (rgb + heights)
      -> segmentation (class, conf)
      -> depth geometry (slope, roughness)
      -> single-frame fusion (FusedCell grid)
      -> terrain assembly (Cell + crater_dist, boundaries)
      -> scoring (safety_score, zone)      # the ONLY decision step
      -> tiles / sites / boundaries / path

Run:  python -m app.pipeline [--scene scene_0] [--write]
--write persists to backend/mock/*.json (the served contract source).
Pure stdlib.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path

from app.perception.segment import segment
from app.depth.pipeline import derive_geometry
from app.slam.fuse import fuse_single, placeholder_path
from app.terrain.assemble import build_cells, extract_boundaries
from app.scoring import safety_score, zone

MOCK = Path(__file__).resolve().parent.parent / "mock"
FIXTURES = MOCK / "fixtures"


def load_scene(name: str) -> dict:
    return json.loads((FIXTURES / name / "scene.json").read_text())


def build_tiles(scene: dict) -> list[dict]:
    seg = segment(scene["rgb"])
    depth = derive_geometry(scene["heights"], scene["cell_size_m"])
    fused = fuse_single(seg, depth)
    tiles = []
    for x, y, cell, height in build_cells(fused, scene["cell_size_m"]):
        tiles.append({"x": x, "y": y, "z": round(height, 2),
                      "class": cell.terrain_class, "slope": round(cell.slope_deg, 2),
                      "safety_score": safety_score(cell), "zone": zone(cell)})
    return tiles


def build_sites(tiles: list[dict]) -> list[dict]:
    buildable = sorted((t for t in tiles if t["zone"] == 0),
                       key=lambda t: t["safety_score"], reverse=True)
    return [{"id": f"S{i + 1}", "x": t["x"], "y": t["y"],
             "safety_score": t["safety_score"], "rank": i + 1}
            for i, t in enumerate(buildable)]


def run(scene_name: str = "scene_0") -> dict:
    scene = load_scene(scene_name)
    seg = segment(scene["rgb"])
    depth = derive_geometry(scene["heights"], scene["cell_size_m"])
    fused = fuse_single(seg, depth)
    tiles = build_tiles(scene)
    return {"tiles": tiles, "sites": build_sites(tiles),
            "boundaries": extract_boundaries(fused), "rover_path": placeholder_path()}


_FILE = {"tiles": "tiles.json", "sites": "sites.json",
         "boundaries": "boundaries.json", "rover_path": "path.json"}


def write(out: dict) -> None:
    for key, fname in _FILE.items():
        (MOCK / fname).write_text(json.dumps(out[key], indent=2) + "\n")


def main():
    ap = argparse.ArgumentParser(description="TerraSight perception pipeline")
    ap.add_argument("--scene", default="scene_0")
    ap.add_argument("--write", action="store_true",
                    help="persist to backend/mock/*.json")
    args = ap.parse_args()
    out = run(args.scene)
    zones = sorted({t["zone"] for t in out["tiles"]})
    print(f"scene={args.scene}: {len(out['tiles'])} tiles, zones={zones}, "
          f"{len(out['sites'])} sites, {len(out['boundaries'])} boundaries")
    if args.write:
        write(out)
        print(f"wrote {', '.join(_FILE.values())} to {MOCK}")


if __name__ == "__main__":
    main()
