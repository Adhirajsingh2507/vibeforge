# TerraSight — Remaining-Work Implementation Plan

Dependency-aware plan for the perception→terrain work that still stands between
the frozen API contract and a real (non-mock) pipeline. Built from read-only
inspection by the dataset, perception, stereo-depth, and terrain-intelligence
agents. **Priority: the smallest working end-to-end vertical slice first**
(P0+P1) — every stage as a minimal stub wired together — then deepen each stage.

The existing architecture is preserved; no redesign. No concrete contradiction
was found.

---

## Current state

**Done / frozen — do not modify for the slice:**
- `backend/app/scoring.py` — `Cell`, `safety_score`, `zone`, precedence, self-check. Sole decision layer.
- `backend/app/guards.py` — trust gates (stale / off-grid / missing-depth / degraded).
- `backend/app/main.py`, `db.py` — frozen API contract + Supabase/mock serving.
- `backend/tests/test_contract.py`, `test_safety_regression.py`, `scripts/validate-terrasight.sh`.

**Missing — the remaining work:**
- `backend/app/perception/`, `depth/`, `slam/`, `terrain/` — all absent.
- Real per-cell signals: today `gen_mock.py` hand-writes `Cell(...)` tuples and `boundaries.json` is 2 static polylines.
- Dataset ingestion, per-dataset calibration, evaluation.

**Invariants every phase must hold (from CLAUDE.md):**
- Measurement stages emit signals only; **only `scoring.py` decides zones**. New modules never call a model to override the rules.
- **No false-safe.** Low confidence / NaN degrade toward neutral, never force Zone 0.
- Frozen `/map/tiles` shape `{x,y,z,class,slope,safety_score,zone}` — `roughness`/`conf`/`crater_dist_m` stay internal; adding a field is a deliberate coordinated contract change.
- `SUPABASE_KEY` (service_role) stays backend-only. Keep heavy CV deps (`torch`) out of the deployed backend (`requirements.txt`); they live in `requirements-cv.txt`.

---

## Keystone: internal handoff contracts

The one thing that lets all four modules be built in parallel without integration
churn is freezing the **internal** shapes between stages (distinct from the frozen
*API* contract). Defined once in P0:

| Handoff | Producer → Consumer | Shape |
|---------|---------------------|-------|
| **Frame** | fixture/camera → perception, depth | `{left, right, rgb, ts, pose_hint?}` |
| **SegMap** | perception → fusion | per-cell `{terrain_class ∈ 9-class, conf ∈ [0,1]}` |
| **DepthMap** | depth → fusion | per-cell `{height_z, slope_deg, roughness}`, NaN where invalid |
| **FusedCell** *(the linchpin)* | slam/fusion → terrain | `{x:int, y:int, height:float, slope_deg, roughness, terrain_class, conf}` |
| **RoverPath** | slam → API | `[{t,x,y,heading,mode}]` (already the frozen shape) |
| **Tiles+Boundaries** | terrain → scoring → API | `[{x,y,z,class,slope,safety_score,zone}]` + `[{type,polyline}]` |

`FusedCell` = exactly `scoring.Cell`'s fields + `(x, y, height)`. Terrain assembly
builds a `Cell` from it (computing `crater_dist_m`), hands it to the existing
`safety_score()`/`zone()`, and maps the result 1:1 onto a tile.

**Dependency graph:**
```
P0 (contracts+fixture)
  └─> P1 (vertical slice: stub pipeline E2E)   ← smallest working thread
        ├─> P2 (depth: real geometry)
        ├─> P3 (perception: real segmentation)
        │      └─> P4 (slam / multi-frame fusion)
        │            └─> P5 (terrain deepening: crater-dist, boundaries)
        └─> P6 (dataset + calibration) ──feeds──> P2
                                                   └─> P7 (persistence, eval, edge, frontend, deploy)
```

---

## P0 — Internal contracts + synthetic fixture  *(keystone, unblocks all)* — ✅ DONE

*Delivered:* `backend/app/contracts.py` (SegCell/DepthCell/FusedCell), fixture
`backend/mock/fixtures/scene_0/scene.json`, `docs/architecture/SYSTEM.md` +
`OWNERSHIP.md` filled, `backend/tests/test_fixtures.py`.


- **Files:** `backend/app/contracts.py` (typed dataclasses/TypedDicts for SegMap, DepthMap, FusedCell); `backend/mock/fixtures/scene_0/` (synthetic height grid + rgb + class map + **expected** tiles/boundaries with known answers); fill `docs/architecture/SYSTEM.md` (currently a stub) to record the handoffs.
- **Dependencies:** none — only the existing `scoring.Cell` field list and the frozen API contract.
- **Inputs:** `scoring.Cell` fields; `CLASS_BEARING` taxonomy; frozen tile/boundary shapes.
- **Outputs:** frozen internal interfaces; one fixture scene whose cells run through `scoring` to a known set of contract-valid tiles.
- **Tests:** `test_fixtures.py` — fixture round-trips to valid `Cell`s and to tiles that pass `test_contract.py` shape checks; expected known-answer tiles match.
- **Risks:** over-specifying interfaces before real data (churn). *Mitigate:* keep `FusedCell` to exactly the fields scoring needs — nothing speculative.
- **Acceptance:** fixture loads; produces contract-valid tiles/boundaries via existing `scoring`; SYSTEM.md documents the handoffs; gate stays green.

## P1 — Vertical slice: stub pipeline end-to-end  *(PRIORITY)* — ✅ DONE

*Delivered:* `perception/segment.py`, `depth/pipeline.py`, `slam/fuse.py`,
`terrain/assemble.py`, `pipeline.py` runner, `tests/test_pipeline.py`. Pipeline
regenerates `mock/*.json`; runs `scene_0 → 27 tiles` across all 4 zones with no
false-safe; full `validate-terrasight.sh` green. Pure stdlib — `requirements.txt`
untouched. **Next: P2 (real SGBM depth), P3 (real segmenter) — parallelizable.**

Replace `gen_mock.py`'s hand-literals with a **real pipeline** over the fixture: every stage present as a minimal stub, wired together, producing contract-valid output.

- **Files:** `backend/app/perception/segment.py` (stub), `backend/app/depth/pipeline.py` (stub), `backend/app/slam/fuse.py` (single-frame passthrough), `backend/app/terrain/assemble.py` (`build_cells` + `crater_dist` + `extract_boundaries`), `backend/app/pipeline.py` (runner: fixture → `backend/mock/*.json`), `backend/tests/test_pipeline.py`.
- **Dependencies:** P0.
- **Inputs:** fixture `scene_0`.
- **Outputs:** `mock/{tiles,sites,boundaries,path}.json` **regenerated by the pipeline** (byte-compatible with the contract), each stage emitting its P0 handoff shape.
- **Tests:** E2E — run pipeline on fixture → output passes `test_contract.py` + known-answer cells; each stub carries its own `__main__` self-check; **run `test_safety_regression.py` against pipeline output** too.
- **Risks:** stubs hiding integration bugs; an overconfident stub `conf` creating a false-safe. *Mitigate:* stubs emit conservative `conf`, NaN where unknown; safety regression gates the output.
- **Acceptance:** `python -m app.pipeline --scene scene_0` writes contract-valid mock; `validate-terrasight.sh` green; `test_pipeline.py` passes. This is the demoable thread: image-shaped input → served zones.

## P2 — Depth stage (real geometry)

- **Files:** `backend/app/depth/calibration.py`, `backend/app/depth/pipeline.py`.
- **Dependencies:** P1 interfaces. Real calibration values come from P6, but synthetic self-checks unblock now.
- **Inputs:** rectified left/right pair + calibration (baseline_m, focal_px, cx, cy).
- **Outputs:** per-cell `height_z` (m), `slope_deg` (deg, local plane fit), `roughness` (m, residual stddev); NaN for invalid disparity.
- **Tests:** synthetic tilted plane recovers known slope within tolerance; flat+noise recovers roughness; invalid disparity → NaN (never a fabricated number).
- **Risks:** wrong calibration → wrong slope → **false-safe**. *Mitigate:* calibration is data not code; known-answer tests; strict NaN discipline (scoring already scores NaN as 0).
- **Acceptance:** SGBM disparity→depth→slope/roughness within tolerance on synthetic pair; drops into `pipeline.py` replacing the depth stub.

## P3 — Perception stage (segmentation)

- **Files:** `backend/app/perception/preprocess.py`, `backend/app/perception/segment.py`.
- **Dependencies:** P1. Pipeline entry point (no upstream).
- **Inputs:** RGB frame. Classical-CV/heuristic first; trained U-Net deferred (keep `torch` out of deployed backend).
- **Outputs:** per-cell `terrain_class` ∈ 9-class taxonomy + `conf` ∈ [0,1], **conservative** — cap heuristic confidence, push near-boundary cases to `unknown` with low conf.
- **Tests:** output uses only the 9 valid class strings; `conf ∈ [0,1]`; ambiguous input never overconfident.
- **Risks:** overconfident output → false-safe promotion; Earth-trained domain gap. *Mitigate:* conf cap; scoring degrades low conf toward 0.4; geometry path still works when class is uncertain.
- **Acceptance:** valid class+conf map for the fixture; replaces the seg stub; safety regression still holds against pipeline output.

## P4 — SLAM / multi-frame fusion

- **Files:** `backend/app/slam/pose.py`, `backend/app/slam/fuse.py`.
- **Dependencies:** P2 + P3 (needs per-frame depth+seg to fuse).
- **Inputs:** sequence of frames (depth + seg + pose hints / IMU / wheel odometry).
- **Outputs:** single world-aligned `FusedCell` grid + `rover_path` `[{t,x,y,heading,mode}]`.
- **Tests:** two overlapping synthetic frames fuse to a consistent grid; low-feature/drift → low-trust flag; path matches frozen shape.
- **Risks:** drift on featureless regolith → warped grid → mislocated hazards. *Mitigate:* fuse IMU/odometry, flag low-trust regions, degrade via `guards` (`mode` drops to cautious/survey).
- **Acceptance:** multi-frame fixture fuses to grid + path; P1 single-frame passthrough still valid.

## P5 — Terrain assembly deepening

- **Files:** `backend/app/terrain/assemble.py`, `backend/app/terrain/boundaries.py`.
- **Dependencies:** P1 (built minimally there), P4 (real fused grid).
- **Inputs:** `FusedCell` grid.
- **Outputs:** `Cell` per cell + `crater_dist_m` (nearest-rim Euclidean over `crater` cells) + boundary polylines `{type,polyline}` for crater/waterbed/mineral_edge; `z` = **real height** passthrough (replacing the `slope/20` fake).
- **Tests:** `crater_dist` known-answer on a synthetic crater; boundary trace yields an ordered polyline; module never calls `zone()`/`safety_score()` itself (stays measurement-side — hands built `Cell`s to the runner).
- **Risks:** crater-distance miscompute → wrong keep-out → false-safe near a rim. *Mitigate:* known-answer tests; conservative default (no rim detected near a crater cell → treat as close).
- **Acceptance:** replaces hand-authored `boundaries.json`; `crater_dist` computed not literal; contract shapes hold.

## P6 — Dataset ingestion + calibration

- **Files:** `backend/data/` (new home — currently unassigned), `manifest.json` (scene→split→label/pair paths), `calibration/{lunar,mars}.json`, `backend/data/validate_dataset.py`.
- **Dependencies:** P0 (formats), consumed by P2.
- **Inputs:** raw simulated stereo+RGB + terrain-class labels.
- **Outputs:** manifest with **split-by-scene** (not by-frame), per-dataset calibration, integrity-validated dataset.
- **Tests:** manifest entries reference existing files; labels within the 9-class taxonomy; **no scene appears in two splits** (leakage guard).
- **Risks:** split leakage → inflated metrics; fabricated paths. *Mitigate:* scene-level split; the validator is the gate.
- **Acceptance:** one realistic scene ingested end-to-end; calibration feeds P2; `validate_dataset.py` green. *(Optional, coordinated:* lift `scoring.py` thresholds into per-dataset calibration data — deferred; it touches the guarded decision layer, so out of the slice.)*

## P7 — Persistence, evaluation, edge, frontend, deploy  *(post-slice)*

- **Persistence:** `pipeline.py` upserts to Supabase via existing `db.upsert` instead of only writing mock. *Test:* mock-fallback path unchanged when env unset. *Risk:* service-role key exposure — backend-only.
- **Evaluation:** seg IoU / depth error / end-to-end zone-&-safety agreement vs ground truth. *Acceptance:* metrics reproducible on the P6 eval split.
- **Edge-AI:** quantize/latency-budget once a trained model lands (after P3 deepens). *Risk:* rad-hard CPU budget.
- **Frontend:** consume `/map/tiles`, `/rover/path`, `/sites`, `/boundaries` into the 3D map (phases.md Phase 6).
- **Deploy:** Docker + CI (phases.md Phase 8).

---

## Ownership & sequencing notes

- Owners: perception → `perception-agent`; depth → `stereo-depth-agent`; slam → `slam-mapping-agent`; terrain/assembly → `terrain-intelligence-agent`; fixtures/dataset/calibration → `dataset-agent`; `pipeline.py` runner + API wiring → `backend-agent`; tests → `testing-agent`. `safety-agent` / `architecture-guardian` review every change touching the measurement↔decision boundary.
- After **P0**, P2 and P3 can proceed in parallel (both only need the P0 interfaces + synthetic fixtures). P4 waits on both. P6 can start any time and feeds P2's real values.
- Keep `scoring.py`, `guards.py`, `main.py`, `db.py`, and the frozen contract **unchanged** throughout P0–P5. `gen_mock.py` remains as a synthetic generator but is superseded as the tiles/boundaries source by `pipeline.py`.
