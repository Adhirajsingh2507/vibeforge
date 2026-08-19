---
name: terrain-analysis
description: Assembles the fused TerraSight grid into per-cell terrain descriptors (terrain_class, slope, roughness, crater distance) and identifies terrain features like crater rims and mineral/water edges that feed zone classification. Use when composing grid cells, computing crater-distance keep-outs, or extracting boundary polylines for the contract.
---

# terrain-analysis

Assembly stage: fused grid → per-cell descriptors + terrain features. This is
the bridge from perception measurements to the deterministic safety layer.

## Per-cell descriptor (the `Cell` in scoring.py)

```
slope_deg, roughness, terrain_class, crater_dist_m, conf
```

- `crater_dist_m` — distance to the nearest detected crater rim. Drives the
  `CRATER_MARGIN_M = 3.0` keep-out in `safety-scoring`. Compute it here.
- Everything else comes from segmentation (`terrain_class`, `conf`) and
  stereo-depth (`slope_deg`, `roughness`).

## Boundaries output

Extract feature polylines for the `/boundaries` contract:
`{ type, polyline }` where `type ∈ {crater, waterbed, mineral_edge}`
(`backend/supabase/schema.sql` stores `polyline` as jsonb).

## Constraints

- **Still measurement, not decision.** Produce descriptors and features; do NOT
  assign zones or scores — that's `safety-scoring`. Keeping this boundary clean
  is a hard project rule (neural/geometric perception vs. deterministic safety).
- Crater-distance and feature detection are geometric/perceptual; the *keep-out
  threshold* that uses them lives in the rules layer, not here.
- Feed `Cell` instances straight into `safety_score()` / `zone()`.
