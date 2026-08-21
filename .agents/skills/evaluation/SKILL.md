---
name: evaluation
description: Model and pipeline evaluation metrics for TerraSight — segmentation accuracy (IoU/per-class), depth error, and end-to-end zone/safety-score agreement against ground truth on simulated datasets. Use when measuring perception quality, comparing model versions, or validating that pipeline changes improve real metrics.
---

# evaluation

Quantitative quality of the **perception** stages and the end-to-end pipeline.
Distinct from `testing` (correctness/regression of rules + contract).

## Metrics

- **Segmentation**: per-class IoU / mIoU, confusion matrix, and calibration of
  `conf` (does low confidence actually correlate with errors? the safety layer
  relies on it).
- **Depth**: metric error (RMSE / abs-rel) on slope + roughness vs. ground
  truth — this is what feeds the geometry-driven score.
- **End-to-end**: agreement of predicted `zone` / `safety_score` against a
  ground-truth terrain map (per-zone precision/recall). Especially: false
  Zone-0 (calling unsafe ground buildable) is the costly error — weight it.

## Constraints

- Evaluate **per dataset** (lunar vs. Mars analog) — metrics don't transfer;
  calibration differs (`dataset-engineering`, `stereo-depth`).
- Evaluate perception measurements and the deterministic scoring **separately**,
  then end-to-end. A scoring change and a model change must be attributable —
  don't conflate them in one number.
- Confidence calibration is a first-class metric here, because the rules layer's
  safety guarantee (uncertain class can't build) is only as good as `conf`.
- Use the simulated datasets' ground truth; don't invent benchmarks the project
  doesn't have.
