"""SLAM fusion — single-frame passthrough (P1) plus real multi-frame fusion (P4).

`fuse_single`/`placeholder_path` (P1): combine one frame's aligned
segmentation + depth grids into a world-aligned list of FusedCell, world
coords == grid indices (+ origin). Unchanged — `pipeline.py` still uses these
for the single-frame slice.

`fuse_sequence`/`rover_path_from_poses` (P4): register a sequence of frames
via `app.slam.pose`, project each into the shared world grid at its recovered
pose, and fuse overlapping cells confidence-weighted (upsert semantics, not
overwrite). Pure numpy + stdlib (numpy already required by `perception.segment`).
"""
from __future__ import annotations
import math
from dataclasses import dataclass

from app.contracts import FusedCell
from app.slam import pose as pose_mod


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


# ---------------------------------------------------------------------------
# P4 — multi-frame fusion
# ---------------------------------------------------------------------------

MAX_FUSE_WEIGHT = 5.0
# ponytail: cap on accumulated confidence weight per cell so one long
# traverse can't make a stale reading immovable to a later good one; raise
# if a mission revisits the same cell far more than a handful of times.


def _finite3(height: float, slope: float, rough: float) -> bool:
    return all(math.isfinite(v) for v in (height, slope, rough))


@dataclass
class _CellAcc:
    fused: FusedCell
    height_weight: float
    label_trust: float


def _upsert(acc: dict[tuple[int, int], _CellAcc], x: int, y: int,
            sc, dc, pose_conf: float) -> None:
    """Fold one (seg, depth) observation into the running world grid at
    (x, y): confidence-weighted running average for geometry, highest-trust
    observation wins for the class label. A NaN depth sample never overwrites
    a known-good reading, and never fabricates one either — it's just skipped
    for geometry (the label/conf vote still counts)."""
    trust = max(0.0, min(1.0, sc.conf)) * max(0.0, min(1.0, pose_conf))
    cur = acc.get((x, y))
    if cur is None:
        good = _finite3(dc.height, dc.slope_deg, dc.roughness)
        acc[(x, y)] = _CellAcc(
            FusedCell(x, y, dc.height, dc.slope_deg, dc.roughness, sc.terrain_class, trust),
            height_weight=min(trust, MAX_FUSE_WEIGHT) if good else 0.0,
            label_trust=trust,
        )
        return
    f = cur.fused
    if _finite3(dc.height, dc.slope_deg, dc.roughness):
        w_new = min(trust, MAX_FUSE_WEIGHT)
        if _finite3(f.height, f.slope_deg, f.roughness):
            w_tot = cur.height_weight + w_new
            f.height = (f.height * cur.height_weight + dc.height * w_new) / w_tot
            f.slope_deg = (f.slope_deg * cur.height_weight + dc.slope_deg * w_new) / w_tot
            f.roughness = (f.roughness * cur.height_weight + dc.roughness * w_new) / w_tot
            cur.height_weight = min(w_tot, MAX_FUSE_WEIGHT)
        else:
            f.height, f.slope_deg, f.roughness = dc.height, dc.slope_deg, dc.roughness
            cur.height_weight = w_new
    if trust >= cur.label_trust:
        f.terrain_class = sc.terrain_class
        cur.label_trust = trust
    f.conf = max(f.conf, trust)


def fuse_sequence(frames, cell_size_m: float = 1.0, origin=(0, 0),
                   search_radius: int = pose_mod.SEARCH_RADIUS_DEFAULT
                   ) -> list[FusedCell]:
    """Register a frame sequence (see `app.slam.pose.track_poses` for the
    frame shape) into one shared world grid and fuse overlapping cells
    confidence-weighted. cell_size_m is accepted for interface symmetry with
    fuse_single/pipeline callers; registration + the world grid itself are in
    grid-cell units. Upsert semantics: each (x, y) appears once, refined —
    never blindly overwritten — by every observation that lands on it."""
    poses = pose_mod.track_poses(frames, search_radius=search_radius)
    ox, oy = origin
    acc: dict[tuple[int, int], _CellAcc] = {}
    for frame, p in zip(frames, poses):
        gx0, gy0 = ox + round(p.x), oy + round(p.y)
        for ly, (seg_row, dep_row) in enumerate(zip(frame["seg"], frame["depth"])):
            for lx, (sc, dc) in enumerate(zip(seg_row, dep_row)):
                _upsert(acc, gx0 + lx, gy0 + ly, sc, dc, p.conf)
    return [a.fused for a in sorted(acc.values(), key=lambda a: (a.fused.y, a.fused.x))]


def rover_path_from_poses(poses: list[pose_mod.Pose]) -> list[dict]:
    """Pose track -> contract `rover_path` rows `{t, x, y, heading, mode}`,
    replacing `placeholder_path()` once a real frame sequence is available."""
    return [{"t": p.t, "x": round(p.x), "y": round(p.y),
             "heading": round(p.heading, 1), "mode": p.mode} for p in poses]


def _demo():
    from app.contracts import SegCell, DepthCell
    seg = [[SegCell("compact_soil", 0.6), SegCell("crater", 0.6)]]
    dep = [[DepthCell(0.2, 1.0, 0.01), DepthCell(-1.0, 30.0, 0.4)]]
    cells = fuse_single(seg, dep)
    assert len(cells) == 2 and cells[0].x == 0 and cells[1].x == 1, cells
    assert cells[0].terrain_class == "compact_soil" and cells[0].height == 0.2
    assert {p["t"] for p in placeholder_path()} == {0, 1, 2}
    print("fusion self-check ok")


def _demo_sequence():
    """P4 multi-frame check: two overlapping frames with a known (dx=2, dy=0)
    offset fuse into one consistent grid; a low-confidence (feature-less)
    registration degrades rover_path mode."""
    from app.contracts import SegCell, DepthCell

    def frame(t, heights, cls="soil", hint=None):
        depth = [[DepthCell(h, 0.0, 0.0) for h in row] for row in heights]
        seg = [[SegCell(cls, 0.6) for _ in row] for row in heights]
        f = {"t": t, "seg": seg, "depth": depth}
        if hint is not None:
            f["pose_hint"] = hint
        return f

    world = [[float(x) + 0.01 * y for x in range(8)] for y in range(3)]
    frame_a = frame(0, [row[0:6] for row in world])
    frame_b = frame(1, [row[2:8] for row in world])
    fused = fuse_sequence([frame_a, frame_b])
    xs = {c.x for c in fused}
    assert xs == set(range(8)), f"expected world cols 0-7 covered, got {sorted(xs)}"
    # overlap column (2..5) got refined by two trusted observations, not overwritten
    overlap_cell = next(c for c in fused if c.x == 3 and c.y == 0)
    assert math.isfinite(overlap_cell.height) and overlap_cell.conf > 0

    poses = pose_mod.track_poses([frame_a, frame_b])
    path = rover_path_from_poses(poses)
    assert path[1]["x"] == 2 and path[1]["y"] == 0, path  # recovers the known offset
    assert path[0]["mode"] == "full" and path[1]["mode"] == "full"

    # a feature-less (flat) second frame can't be registered confidently ->
    # rover_path mode degrades off "full", never fabricating a confident move
    flat = frame(1, [[5.0] * 6 for _ in range(3)])
    degraded_poses = pose_mod.track_poses([frame_a, flat])
    degraded_path = rover_path_from_poses(degraded_poses)
    assert degraded_path[1]["mode"] != "full", degraded_path

    print("sequence fusion self-check ok")


if __name__ == "__main__":
    _demo()
    _demo_sequence()
