---
name: stereo-depth
description: Stereo depth estimation for TerraSight — converts left/right rover camera pairs into disparity, then metric depth, then per-cell slope and roughness for the terrain grid. Use when working on disparity matching, depth-map calibration, or deriving the geometric slope/roughness signals that feed safety scoring.
---

# stereo-depth

Geometric stage: stereo pair → disparity → metric depth → per-cell `slope_deg`
and `roughness`.

## What it produces (feeds safety-scoring)

- `slope_deg` — local surface slope in degrees.
- `roughness` — per-cell height standard deviation in meters.
- Depth also seeds the height field SLAM fuses into the grid.

These are exactly the geometric inputs `scoring.py` uses (`SLOPE_SAFE_DEG=8`,
`SLOPE_MAX_DEG=25`, `ROUGH_MAX=0.30`). Keep units consistent: **degrees** and
**meters**, or the calibrated thresholds silently break.

## Constraints

- **Geometry is the trustworthy signal.** The safety layer leans on slope +
  roughness precisely because they work even when the class label is uncertain.
  Bad depth calibration undermines the whole safety score — treat calibration
  as a first-class task, not an afterthought.
- Depth-map calibration is dataset-dependent (baseline, focal length, sensor).
  Leave calibration parameters tunable per dataset — see README status:
  "depth-map calibration on more datasets" is explicitly open.
- Output measurements only; no zone/score decisions here.
- Handle low-texture / shadowed regions honestly (invalid disparity → mark
  cell uncertain rather than emitting a confident wrong depth).
