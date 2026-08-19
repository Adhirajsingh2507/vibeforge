---
name: safety-scoring
description: TerraSight's deterministic construction Safety Score and zone classifier — the pure-rules layer in backend/app/scoring.py that maps per-cell terrain descriptors to a safety_score in [0,1] and a zone (0 safe / 1 nav / 2 geological / 3 hazard). Use when changing scoring weights, zone precedence, thresholds, or reasoning about how uncertain perception must NOT force a buildable zone.
---

# safety-scoring

The **deterministic** decision layer. Implemented in `backend/app/scoring.py`.
This is intentionally decoupled from the neural net — geometry still scores
when the class label is uncertain.

## The rules (do not silently change)

- `safety_score(Cell)` → weighted `[0,1]`: `W_SLOPE .35 / W_ROUGH .25 /
  W_CLASS .20 / W_CRATER .20`. Geometry-driven.
- Low class confidence shrinks `class_f` toward neutral `0.4` (`* c.conf`) so an
  uncertain label **cannot** promote a cell to Zone 0. This is a safety
  invariant — the `_demo()` self-check asserts it. Keep it.
- `zone(Cell)` precedence: **hazard(3) > geological(2) > navigation(1) >
  safe(0)** — matches README. Zone 0 also requires `conf >= CONF_MIN_BUILD`
  and class ∈ {compact_soil, soil}.

## Zones

| Zone | Meaning |
|---|---|
| 0 | Construction-safe (flat, compact, high bearing) |
| 1 | Navigation-only (drivable, unsafe to build) |
| 2 | Geological interest (waterbed, mineral_edge) |
| 3 | Hazardous (crater rim / margin, steep slope, rough rock) |

## Constraints

- **Rules only. No model inference in this file.** Inputs are measurements from
  the perception stages; outputs are the contract's `safety_score` + `zone`.
- Thresholds (`SLOPE_MAX_DEG`, `ROUGH_MAX`, `CRATER_MARGIN_M`, ...) are
  per-dataset calibration knobs (lunar regolith ≠ Mars analog). Tune values,
  don't hard-fork the logic.
- Any change to weights/thresholds/precedence must keep `_demo()` passing and
  add an assertion for the new behavior. Run: `python -m app.scoring` from
  `backend/`.
