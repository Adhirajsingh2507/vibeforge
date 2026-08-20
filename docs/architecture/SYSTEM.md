# TerraSight — System Architecture

Authoritative pipeline reference. The decision layer and API contract are frozen
(see root `CLAUDE.md`); this documents the flow and the internal handoffs the
perception stages communicate through.

## Pipeline

```
camera ─▶ preprocessing ─▶ segmentation ─┐
                        ─▶ stereo depth ──┤─▶ SLAM fusion ─▶ terrain grid
                                          │        │
                                          │        └─▶ rover path
                                          ▼
                      terrain descriptors ─▶ SAFETY SCORE + ZONE ─▶ site ranking
                                          │                                │
                                          └─▶ boundaries                   ▼
                                                    ─▶ FastAPI (frozen contract)
                                                    ─▶ Supabase / mock ─▶ frontend
```

Everything up to the terrain grid is **measurement**. `scoring.py` (Safety Score
+ Zone) is the **only decision layer**. Measurement stages never decide a zone,
and no model output may override the deterministic rules.

## Module ownership

| Stage | Path | Owner | Status |
|-------|------|-------|--------|
| Preprocessing + segmentation | `backend/app/perception/` | perception-agent | P1 stub (classical) |
| Stereo depth → slope/roughness | `backend/app/depth/` | stereo-depth-agent | P1 stub (height-grid) |
| SLAM / fusion → grid + path | `backend/app/slam/` | slam-mapping-agent | P1 single-frame |
| Terrain descriptors + boundaries | `backend/app/terrain/` | terrain-intelligence-agent | P1 |
| Safety Score + Zone | `backend/app/scoring.py` | terrain-intelligence-agent | done, frozen |
| Trust gates | `backend/app/guards.py` | terrain-intelligence-agent | done |
| Pipeline runner | `backend/app/pipeline.py` | backend-agent | P1 |
| API | `backend/app/main.py` | backend-agent | done, frozen |
| Persistence | `backend/app/db.py`, `backend/supabase/` | database-agent | done |
| Fixtures / datasets | `backend/mock/`, `gen_mock.py` | dataset-agent | mock + scene_0 |

## Internal data contracts (`backend/app/contracts.py`)

Frozen in-process handoffs between stages (distinct from the API contract):

| Handoff | Producer → Consumer | Shape |
|---------|---------------------|-------|
| `SegCell` | perception → fusion | `{terrain_class ∈ 9-class, conf ∈ [0,1]}` |
| `DepthCell` | depth → fusion | `{height, slope_deg, roughness}` (m/deg, NaN if invalid) |
| `FusedCell` | fusion → terrain | `{x, y, height, slope_deg, roughness, terrain_class, conf}` |
| tiles | terrain+scoring → API | `{x, y, z, class, slope, safety_score, zone}` |
| boundaries | terrain → API | `{type, polyline}` |
| rover_path | slam → API | `{t, x, y, heading, mode}` |

`FusedCell` = `scoring.Cell`'s inputs + `(x, y, height)`. `roughness`, `conf`, and
`crater_dist_m` are consumed internally by scoring and never appear in the API.

## Coordinates, timestamps, confidence

- **Coordinates:** world-grid cells `(x, y)`; metric spacing = `cell_size_m`. Tile
  `z` is elevation (m). In P1 world coords equal grid indices (single frame); P4
  registers frames into a shared world grid via SLAM pose.
- **Timestamps:** rover_path `t` is a frame/tick index. Frame freshness is gated
  at ingest by `guards.is_stale` (mission-clock seconds).
- **Confidence:** segmentation emits `conf ∈ [0,1]`, conservative — a heuristic is
  capped and pushed to `unknown` when ambiguous. Scoring shrinks class bearing
  toward neutral 0.4 by `conf`, so low confidence can never force Zone 0.

## Failure / degradation rules

- Missing/NaN depth → `_lin` scores 0, never full credit (no false-safe).
- Low sensor quality / stale frame / off-grid coord → `guards` reject or degrade.
- Zone precedence **hazard > geological > navigation > construction-safe**; when
  signals conflict, never Zone 0.
- Rover degradation ladder (P4): full → cautious → survey-only → safe-hold,
  reversible as confidence recovers; reflected in rover_path `mode`.

## Build order

See `docs/implementation-plan.md`. P0 (contracts + fixture) and P1 (this
stub pipeline, end-to-end on `scene_0`) are complete; P2–P7 deepen each stage
behind these same handoffs.
