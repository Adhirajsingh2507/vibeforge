# backend/data — dataset home (P6)

Dataset ingestion/calibration for TerraSight. Everything here is data, not
code; the consuming loaders (P2 depth, P3 segmentation) are separate work.

## Status: SYNTHETIC placeholders

No real lunar or Mars-analog stereo capture exists yet. `scenes/*/left.txt`
and `right.txt` are explicit placeholder text files (not real imagery) so the
manifest paths and format are established honestly rather than fabricated
silently, per the `dataset-engineering` skill. Replace them with real
rectified stereo frames (e.g. `.png`/`.tif`) when a dataset lands — the
manifest `stereo.left`/`stereo.right` paths are the only thing that needs to
change.

## manifest.json

`{"entries": [{scene_id, dataset, split, stereo: {left, right}, labels,
calibration}, ...]}`. All paths are relative to `backend/data/`.

- `scene_id` — unique per physical scene. A `scene_id` must map to exactly
  one `split` across the whole manifest — this is the split-by-scene
  leakage guard (adjacent stereo frames from the same scene must never end
  up in two different splits).
- `split` — one of `train`, `val`, `test`.
- `dataset` — which rig calibration applies (`lunar` or `mars`); informational,
  cross-checked against `calibration` path by convention.
- `calibration` — path to a calibration JSON under `calibration/`.

## Label format

`labels.json` per scene: `{"scene_id": ..., "labels": [[class, ...], ...]}`,
a row-major per-cell grid (same shape convention as
`backend/mock/fixtures/scene_0/scene.json`'s `heights`/`rgb` grids). Each
`class` string must be exactly one of the 9-class taxonomy, kept in sync with
`app.scoring.CLASS_BEARING`:

```
compact_soil, soil, loose_soil, rock, crater, shadow, waterbed,
mineral_edge, unknown
```

No other strings are valid labels — a renamed/misspelled class silently
breaks `CLASS_BEARING` lookups and zoning downstream.

## calibration/{lunar,mars}.json

One file per physical rig. Keys match `app.depth.calibration.Calibration`
dataclass fields **exactly** (pinhole rig params + `cv2.StereoSGBM` knobs):
`baseline_m, focal_px, cx, cy, min_disparity, num_disparities, block_size,
uniqueness_ratio, speckle_window_size, speckle_range, disp12_max_diff,
min_valid_disparity_px`. Lunar and Mars-analog values are deliberately
distinct (different baseline/optics and different SGBM tuning for shadow
contrast vs. dust/haze) — calibration is per-dataset data, never a global
constant, and is never baked into model code.

## Validation

```
cd backend
python data/validate_dataset.py
```

Checks: every manifest path exists; all labels are within the 9-class
taxonomy; no `scene_id` appears under two different `split`s (leakage guard);
every referenced calibration file parses as JSON and has all `Calibration`
fields. Exits non-zero and prints each violation on failure.
