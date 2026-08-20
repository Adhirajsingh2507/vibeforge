"""P4 fixture self-check — real multi-frame fusion over `scene_seq_0`.

Loads a short sequence of overlapping frames cropped from one synthetic world
(known ground-truth pose offset baked into the fixture), runs them through
the *real* upstream stages (segmentation, depth geometry) exactly as
`pipeline.py` does for a single frame, then through this package's pose
tracking + sequence fusion. Asserts:
    1. pose registration recovers the fixture's known offset within tolerance
    2. the fused grid is one consistent world-aligned FusedCell list
    3. rover_path is contract-shaped, and a feature-less patch degrades mode

Run:  python -m app.slam.fixture_check
"""
from __future__ import annotations
import json
import math
from pathlib import Path

from app.perception.segment import segment
from app.depth.pipeline import derive_geometry
from app.slam import pose as pose_mod
from app.slam.fuse import fuse_sequence, rover_path_from_poses

FIXTURE = Path(__file__).resolve().parent.parent.parent / "mock/fixtures/scene_seq_0/scene.json"
TOLERANCE_CELLS = 1.0  # pose recovery must land within this many grid cells of truth


def _crop(grid, offset_x: int, width: int):
    return [row[offset_x:offset_x + width] for row in grid]


def _build_world_frames(scene: dict) -> list[dict]:
    frames = []
    for spec in scene["frames"]:
        heights = _crop(scene["world_heights"], spec["offset_x"], scene["frame_width"])
        rgb = _crop(scene["world_rgb"], spec["offset_x"], scene["frame_width"])
        f = {"t": spec["t"], "seg": segment(rgb),
             "depth": derive_geometry(heights, scene["cell_size_m"])}
        if "pose_hint" in spec:
            f["pose_hint"] = {"x": spec["pose_hint"][0], "y": spec["pose_hint"][1]}
        frames.append(f)
    return frames


def _build_flat_frames(scene: dict) -> list[dict]:
    heights = [[scene["flat_height"]] * scene["frame_width"] for _ in range(scene["frame_height"])]
    rgb = [[scene["flat_rgb"]] * scene["frame_width"] for _ in range(scene["frame_height"])]
    depth = derive_geometry(heights, scene["cell_size_m"])
    seg = segment(rgb)
    return [{"t": spec["t"], "seg": seg, "depth": depth} for spec in scene["flat_frames"]]


def check_pose_recovery(scene: dict, frames: list[dict]) -> list[pose_mod.Pose]:
    poses = pose_mod.track_poses(frames)
    step = scene["known_offset_x_step"]
    for i, p in enumerate(poses[1:], start=1):
        expected = step * i
        assert abs(p.x - expected) <= TOLERANCE_CELLS, \
            f"frame {i}: expected x~{expected}, got {p.x}"
        assert abs(p.y) <= TOLERANCE_CELLS, f"frame {i}: unexpected y drift {p.y}"
        # half the frame's real estate is fresh ground each step (by fixture
        # design: step == frame_width/2) — a confident but not maximal match,
        # so "full" or "cautious", never degraded further.
        assert p.mode in ("full", "cautious"), \
            f"clean overlapping ramp should not degrade past cautious, got {p.mode}"
    return poses


def check_fused_grid(scene: dict, frames: list[dict]) -> None:
    fused = fuse_sequence(frames)
    xs = {c.x for c in fused}
    assert xs == set(range(scene["world_cols"])), \
        f"expected world cols 0..{scene['world_cols'] - 1} covered, got {sorted(xs)}"
    # upsert, not overwrite: every cell keyed once, geometry finite, conf in [0,1]
    seen = set()
    for c in fused:
        assert (c.x, c.y) not in seen, f"duplicate cell {(c.x, c.y)} — grid not upserted"
        seen.add((c.x, c.y))
        assert math.isfinite(c.height) and math.isfinite(c.slope_deg)
        assert 0.0 <= c.conf <= 1.0, c


def check_rover_path(frames: list[dict], poses: list[pose_mod.Pose]) -> None:
    path = rover_path_from_poses(poses)
    for row in path:
        assert set(row) == {"t", "x", "y", "heading", "mode"}, row
        assert row["mode"] in ("full", "cautious", "survey-only", "safe-hold"), row


def check_degradation(scene: dict) -> None:
    """A feature-less (flat) frame pair can't be registered confidently —
    the degradation ladder must drop mode off "full", never fabricate a
    confident move on regolith with no distinguishing signal."""
    flat_frames = _build_flat_frames(scene)
    poses = pose_mod.track_poses(flat_frames)
    path = rover_path_from_poses(poses)
    assert path[0]["mode"] == "full"  # anchor frame is always trusted
    assert path[1]["mode"] != "full", f"flat/feature-less patch should degrade, got {path[1]}"
    assert poses[1].conf == pose_mod.REG_CONF_FLOOR, poses[1]


def main():
    scene = json.loads(FIXTURE.read_text())
    frames = _build_world_frames(scene)
    poses = check_pose_recovery(scene, frames)
    check_fused_grid(scene, frames)
    check_rover_path(frames, poses)
    check_degradation(scene)
    print("scene_seq_0 fixture self-check ok")


if __name__ == "__main__":
    main()
