# TerraSight — Build Phases (Checklists)

Terrain classification + construction Safety Score from rover stereo/RGB imagery.
Each task tags its **owner agent**. Perception stages parallelize once the contract (Phase 1) is frozen.

Owner legend: `backend-agent` · `perception-agent` · `stereo-depth-agent` · `slam-mapping-agent` · `terrain-intelligence-agent` · `safety-agent` · `dataset-agent` · `edge-ai-agent` · `database-agent` · `devops-agent` · `testing-agent` · `architecture-guardian`

---

## Phase 0 — Foundations *(done / ongoing)*
- [x] `CLAUDE.md` — purpose, ownership, frozen contract, invariants, DoD — `architecture-guardian`
- [x] Frozen API contract defined — `backend-agent`
- [x] Supabase schema + mock-JSON fallback (`db.py`) — `database-agent`
- [x] Validation gate `scripts/validate-terrasight.sh` — `testing-agent`
- [x] Safety regression suite — `safety-agent`
- [x] Detailed arch docs `docs/architecture/SYSTEM.md` + `OWNERSHIP.md` — `architecture-guardian`
- [x] Internal handoff contracts (`app/contracts.py`) + synthetic fixture `scene_0` (P0) — `dataset-agent`
- [ ] Keep CLAUDE.md + skills in sync as phases land *(ongoing)* — `architecture-guardian`

## Phase 1 — API Contract & Backend Service ✅
- [x] Endpoints `/map/tiles`, `/rover/path`, `/sites`, `/boundaries`, `/health` — `backend-agent`
- [x] Freeze request/response shapes for frontend (documented in CLAUDE.md) — `backend-agent`
- [x] CORS wiring — `backend-agent`
- [x] Service-role key stays backend-only (verified: no frontend refs, gate greps for committed key) — `database-agent`
- [x] Contract-shape check backend vs mock (`tests/test_contract.py`, wired into gate) — `testing-agent`

## Phase 2 — Perception Pipeline (measurements only) ✅
End-to-end pipeline `scene → tiles`, all 4 zones, no false-safe, served through the
frozen contract. Every stage has a real implementation behind the frozen internal
handoffs — see `docs/implementation-plan.md` (P0–P5).
- [x] Per-pixel segmentation + confidence — real classical HSV + opponent-colour classifier w/ texture gate (P3) — `perception-agent`
- [x] Stereo calibration + disparity → metric depth — real `cv2.StereoSGBM`, calibration as data, `cv2` lazy-gated (P2) — `stereo-depth-agent`
- [x] Per-cell slope + roughness (`derive_geometry`, fed by real stereo or height grid) — `stereo-depth-agent`
- [x] Pose estimation + drift + multi-frame fusion → world grid + real `rover_path` w/ degradation ladder (P4) — `slam-mapping-agent`
- [x] Per-cell descriptors + computed crater-distance — `terrain-intelligence-agent`
- [x] Boundary polyline extraction — real adjacency/border tracing (P5) — `terrain-intelligence-agent`

## Phase 3 — Safety Scoring & Zones (decision layer) ✅
- [x] Deterministic `scoring.py`: descriptors → safety_score [0,1] + zone 0–3 — `terrain-intelligence-agent`
- [x] Zone precedence + thresholds + weights — `terrain-intelligence-agent`
- [x] Uncertain perception degrades to neutral, never forces buildable — `safety-agent`
- [x] No ML override of deterministic rules; no false-safe (locked by `test_safety_regression.py` + `test_pipeline.py`) — `safety-agent`
- [x] Input guards for NaN / out-of-range (`guards.py`) — `terrain-intelligence-agent`
- [x] Verify measurement↔decision boundary holds (assembly never calls `zone()`/`safety_score()`) — `architecture-guardian`

## Phase 4 — Dataset & Evaluation ✅
- [x] Ingestion path `backend/data/` — manifest + label format + synthetic scenes (real imagery pending) — `dataset-agent`
- [x] Per-dataset calibration params `calibration/{lunar,mars}.json` (match `Calibration` fields) — `dataset-agent`
- [x] Train/eval splits (split-by-scene) + `validate_dataset.py` leakage guard — `dataset-agent`
- [x] Metrics `app/eval/metrics.py` — seg IoU/mIoU, depth MAE/RMSE, zone agreement, safety MAE, **false-safe rate** (headline) — `testing-agent`

## Phase 5 — Edge / On-Rover Optimization
- [ ] Quantize + shrink seg/depth/SLAM models — `edge-ai-agent`
- [ ] Latency / memory / power budgeting — `edge-ai-agent`
- [ ] Backbone choices for rover-class compute — `edge-ai-agent`

## Phase 6 — Frontend
_Owned by a teammate — out of scope for this repo's agent workflow._

## Phase 7 — Testing & QA
- [x] Scoring + stage self-check demos (`__main__` in scoring/segment/depth/fuse/terrain) — `testing-agent`
- [x] Contract-shape checks (backend vs mock, `test_contract.py`) — `testing-agent`
- [x] Fixture + end-to-end pipeline tests (`test_fixtures.py`, `test_pipeline.py`) — `testing-agent`
- [ ] Dedicated mock-fallback path test in `db.py` — `testing-agent`
- [ ] Safety regression invariants in **CI** (currently local gate only) — `safety-agent`

## Phase 8 — Deployment
- [ ] Dockerfiles (frontend + FastAPI) — `devops-agent`
- [ ] GitHub Actions CI/CD — `devops-agent`
- [ ] Vercel config + env wiring; no secrets in frontend bundle — `devops-agent`

---

**Definition of done (per task):** contract respected · measurement↔decision split preserved · no false-safe · validation gate + tests green · deployed.
