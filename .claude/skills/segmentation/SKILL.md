---
name: segmentation
description: Per-pixel terrain classification for TerraSight — labels each pixel of the rover RGB feed into terrain classes (compact_soil, soil, loose_soil, rock, crater, shadow, waterbed, mineral_edge, unknown) with a confidence. Use when working on the semantic-segmentation model, its class taxonomy, or the confidence output that feeds terrain analysis and safety scoring.
---

# segmentation

Neural stage: RGB frame → per-pixel `terrain_class` + `conf ∈ [0,1]`.

## Class taxonomy (must match downstream)

The rules layer keys directly off these strings — do not rename without
updating `backend/app/scoring.py`:

`compact_soil`, `soil`, `loose_soil`, `rock`, `crater`, `shadow`,
`waterbed`, `mineral_edge`, `unknown`.

- `CLASS_BEARING` in `scoring.py` weights build viability by class.
- `waterbed` / `mineral_edge` drive Zone 2 (geological interest).
- `crater` / `rock` drive Zone 3 with roughness.

## Constraints

- **Output measurements, never decisions.** Emit class + confidence only. Zone
  and safety_score are computed downstream by the deterministic `safety-scoring`
  layer. Never have the model predict a zone or score.
- **Always emit confidence.** Downstream shrinks low-confidence classes toward
  neutral so an uncertain label can't force a buildable zone. A class without a
  usable `conf` breaks that safety property.
- Unknown/occluded pixels → `unknown` (conf reflects uncertainty), not a guess.
- Keep the model edge-deployable (see `edge-ai`): favor a compact backbone;
  the rover runs it, not a datacenter.

## Data

Training/eval data conventions live in `dataset-engineering`. Simulated lunar
regolith and Mars-analog sets differ — classes may need per-dataset
calibration.
