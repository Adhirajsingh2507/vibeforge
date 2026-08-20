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

## Phase 2 — Perception Pipeline (measurements only)
**Vertical slice ✅ landed (P0+P1):** stub pipeline runs end-to-end `scene_0 → tiles`,
all 4 zones, no false-safe, served through the frozen contract. Deepen each stub in
P2–P5 — see `docs/implementation-plan.md`.
Legend: `[~]` stub landed via the slice · `[ ]` real implementation pending.
- [~] RGB preprocessing + per-pixel segmentation + confidence (classical nearest-colour stub) — `perception-agent`
- [ ] Stereo calibration + disparity → metric depth (P2, real SGBM) — `stereo-depth-agent`
- [~] Per-cell slope + roughness (from height grid; real stereo in P2) — `stereo-depth-agent`
- [ ] Pose estimation + drift + multi-frame fusion (P4) — `slam-mapping-agent`
- [~] Single-frame fusion → grid + `rover_path` (placeholder path) — `slam-mapping-agent`
- [~] Per-cell descriptors + computed crater-distance — `terrain-intelligence-agent`
- [~] Boundary polyline extraction (coordinate-sort; real tracing P5) — `terrain-intelligence-agent`

## Phase 3 — Safety Scoring & Zones (decision layer) ✅
- [x] Deterministic `scoring.py`: descriptors → safety_score [0,1] + zone 0–3 — `terrain-intelligence-agent`
- [x] Zone precedence + thresholds + weights — `terrain-intelligence-agent`
- [x] Uncertain perception degrades to neutral, never forces buildable — `safety-agent`
- [x] No ML override of deterministic rules; no false-safe (locked by `test_safety_regression.py` + `test_pipeline.py`) — `safety-agent`
- [x] Input guards for NaN / out-of-range (`guards.py`) — `terrain-intelligence-agent`
- [x] Verify measurement↔decision boundary holds (assembly never calls `zone()`/`safety_score()`) — `architecture-guardian`

## Phase 4 — Dataset & Evaluation
- [ ] Ingest/convert simulated stereo+RGB + terrain labels — `dataset-agent`
- [ ] Per-dataset calibration params (seg/depth/scoring depend on) — `dataset-agent`
- [ ] Train/eval splits + label format — `dataset-agent`
- [ ] Metrics: seg IoU, depth error, zone/safety agreement vs GT — `testing-agent`

## Phase 5 — Edge / On-Rover Optimization
- [ ] Quantize + shrink seg/depth/SLAM models — `edge-ai-agent`
- [ ] Latency / memory / power budgeting — `edge-ai-agent`
- [ ] Backbone choices for rover-class compute — `edge-ai-agent`

## Phase 6 — Frontend (Next.js + TS + Tailwind)
- [ ] Map tile viewer + zone overlay — `claude` (UI)
- [ ] Rover path + site/boundary rendering — `claude` (UI)
- [ ] Consume only the frozen contract — `backend-agent` (contract) / `claude` (UI)
- [ ] Responsive + accessible pass — `claude` (UI)

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
