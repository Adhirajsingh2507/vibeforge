---
name: slam-mapping
description: SLAM / pose estimation and multi-frame fusion for TerraSight — tracks rover pose and fuses per-frame depth + segmentation into a single persistent world-aligned terrain grid and the rover path. Use when working on localization, frame-to-frame registration, grid fusion, or producing the rover_path output.
---

# slam-mapping

Fusion stage: per-frame depth + class → rover pose → one persistent, world-
aligned occupancy/height grid, plus the rover trajectory.

## Outputs

- The fused grid of cells that `terrain-analysis` turns into contract tiles
  (`x, y, z` positions).
- `rover_path` contract rows: `{ t, x, y, heading, mode }` where `mode` is the
  drive mode (`full`, `cautious`, ...). See `backend/mock/path.json`.

## Constraints

- **World-aligned, stable grid coordinates.** Tiles are keyed `unique(x, y)` in
  Supabase — fusion must map observations to consistent integer grid cells so
  upserts merge instead of duplicating.
- Fuse *measurements* (accumulate class votes + confidence, height samples),
  not decisions. Zone/score stay downstream and deterministic.
- Later frames refine earlier cells — support upsert semantics (`db.upsert`),
  don't append blindly.
- Keep it edge-runnable (see `edge-ai`): bounded memory, no offline batch
  optimization the rover can't afford.
- Drive `mode` reflects rover state; keep the vocabulary consistent with what
  the frontend renders.
