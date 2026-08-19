---
name: dataset-engineering
description: Dataset handling for TerraSight — simulated lunar/Mars-analog stereo + RGB imagery, terrain-class labels, and the per-dataset calibration that segmentation, depth, and scoring depend on. Use when preparing training/eval data, defining label formats, splitting datasets, or managing per-dataset calibration parameters.
---

# dataset-engineering

TerraSight trains and evaluates on **simulated** planetary datasets (lunar
regolith, Mars analogs). Real rover data is scarce; sim is the working set.

## What data must supply

- Stereo pairs + RGB with known calibration (baseline, focal length) for
  `stereo-depth`.
- Per-pixel labels in the fixed class taxonomy (`segmentation`):
  `compact_soil, soil, loose_soil, rock, crater, shadow, waterbed,
  mineral_edge, unknown`.
- Ground-truth geometry where available (slope/height) for `evaluation`.

## Constraints

- **Datasets are not interchangeable.** Lunar regolith ≠ Mars analog — slope,
  roughness, and depth calibration knobs (`scoring.py`, stereo baseline) must be
  tracked *per dataset*, not globally. README explicitly flags "calibration on
  more datasets" as open work.
- Keep the label taxonomy stable and exactly matching the strings the rules
  layer keys on; a renamed class silently breaks `CLASS_BEARING` and zoning.
- Separate train/val/test splits by scene, not random frames (adjacent stereo
  frames leak).
- Don't fabricate dataset paths or formats — establish them explicitly; none
  are committed to the repo yet beyond `backend/mock/*.json` (which is the API
  contract, not training data).
