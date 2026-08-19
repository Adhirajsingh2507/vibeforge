---
name: cv-pipeline
description: End-to-end TerraSight perception pipeline that turns stereo + RGB rover camera feeds into the frozen terrain-map API contract. Use when wiring the full flow (segmentation → stereo depth → SLAM fusion → terrain analysis → safety scoring) or when a change spans more than one perception stage and needs to stay contract-compatible.
---

# cv-pipeline

The TerraSight perception flow, stage by stage. This skill is the map; each
stage has its own skill for depth.

## Flow

```
stereo+RGB frames
  → segmentation   (per-pixel terrain_class + conf)   → skill: segmentation
  → stereo-depth   (disparity → depth → per-cell slope/roughness) → skill: stereo-depth
  → slam-mapping   (pose + fuse frames into a persistent grid)    → skill: slam-mapping
  → terrain-analysis (assemble grid cells: class/slope/roughness/crater_dist) → skill: terrain-analysis
  → safety-scoring (deterministic zone + safety_score)  → skill: safety-scoring
  → db.upsert(...) → FastAPI contract                   → skills: supabase, fastapi
```

## Hard constraints

- **The API contract is frozen** (`backend/mock/*.json`, README table). Every
  stage's output must ultimately reduce to those exact shapes. Never change a
  contract field name or type as a side effect of a pipeline change.
- **Neural perception and deterministic safety stay separate.** Stages 1–4
  produce *measurements* (class, conf, slope, roughness, crater distance).
  Stage 5 (`safety-scoring`) is pure rules. Do not let a model emit a
  zone/safety_score directly, and do not bake thresholds into the perception
  stages.
- Low class confidence must degrade gracefully — geometry still scores even
  when the label is uncertain (see `safety-scoring`).

## Repo

- `backend/app/scoring.py` — the only implemented stage today (rules).
- `backend/app/db.py`, `backend/app/main.py` — persistence + contract serving.
- Perception stages (segmentation/depth/SLAM) are documented in the status
  table but not all wired to live endpoints yet — don't assume code exists;
  check before referencing it.
