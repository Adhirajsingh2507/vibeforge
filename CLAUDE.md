# TerraSight

Onboard Edge-AI perception for autonomous planetary rovers. Turns stereo + RGB
camera feeds into a live terrain map, classifies every cell into decision zones,
and scores it for construction — **on the rover, without waiting on Earth**.

Procedures live in skills (`cv-pipeline`, `safety-scoring`, `fastapi`,
`segmentation`, `stereo-depth`, `slam-mapping`, `terrain-analysis`, `testing`,
`dataset-engineering`, `edge-ai`, `evaluation`). This file is the contract and
the invariants — keep it concise; put how-to detail in the relevant skill.

## Architecture

Pipeline (measurement → decision → serve):

```
camera → preprocessing → segmentation ─┐
                       → stereo depth ──┤→ SLAM fusion → terrain grid
                                        └→ (per-cell slope/roughness)
terrain grid → terrain descriptors → SAFETY SCORE + ZONE → site ranking / nav
            → FastAPI (frozen contract) → Supabase / mock → frontend
```

Everything up to the terrain grid is **measurement** (perception). Zone + Safety
Score is the **only decision layer**. The two must not blur (see Invariants).

## Directory ownership

Authoritative owners — do not modify another subsystem without coordination.

| Path | Owner agent |
|------|-------------|
| `backend/app/main.py` | backend-agent (API) |
| `backend/app/scoring.py` | terrain-intelligence-agent (decision layer) |
| `backend/app/guards.py` | terrain-intelligence-agent (trust gates) |
| `backend/app/db.py` | database-agent |
| `backend/supabase/` | database-agent |
| `backend/mock/`, `gen_mock.py` | dataset-agent |
| `backend/tests/`, `scripts/validate-terrasight.sh` | testing-agent |
| `frontend/` | frontend |
| `.github/`, Docker, `vercel.json` | devops-agent |

Perception stages (`perception/`, `depth/`, `slam/`, `terrain/`) belong to their
named agents; the safety layer is guarded by `safety-agent` / `architecture-guardian`.

## API contract (FROZEN)

The frontend is built against these exact shapes. Adding/removing/renaming a key
is a breaking change — revise deliberately and update `tests/test_contract.py`.

| Endpoint | Returns (row shape) |
|----------|---------------------|
| `GET /health` | `{status, source}` |
| `GET /map/tiles` | `[{x, y, z, class, slope, safety_score, zone}]` |
| `GET /rover/path` | `[{t, x, y, heading, mode}]` |
| `GET /sites` | `[{id, x, y, safety_score, rank}]` |
| `GET /boundaries` | `[{type, polyline}]` |

Coordinates are world-grid metres; `t` is a frame/tick index; `heading` degrees.
Frontend and backend communicate **only** through this contract — the frontend
never touches Supabase or perception internals directly.

## Terrain classes

Segmentation taxonomy (each has an explicit bearing weight in `CLASS_BEARING`):
`compact_soil`, `soil`, `loose_soil`, `rock`, `crater`, `shadow`, `waterbed`,
`mineral_edge`, `unknown`.

## Zones (0–3)

Precedence **hazard > geological > navigation > construction-safe**:

- **Zone 0 — construction-safe:** confident buildable class (`compact_soil`/`soil`),
  sub-threshold slope & roughness, clear of crater margin, score ≥ threshold.
- **Zone 1 — navigation:** drivable but not buildable (default).
- **Zone 2 — geological:** `waterbed` / `mineral_edge` — protected, never built on.
- **Zone 3 — hazard:** crater, steep slope, boulder, or inside crater keep-out.

## Safety Score principles

`safety_score ∈ [0,1]` is a pure, deterministic, geometry-driven weighting of
slope, roughness, class bearing, and crater distance (`scoring.py`). Thresholds
are per-dataset calibration knobs, not universal constants.

## Invariants (non-negotiable)

- **No false-safe.** No terrain/geometry/sensor input may reach Zone 0 / high
  score when it must not. Uncertain perception degrades toward neutral and can
  **never** force a buildable zone. Low class-confidence shrinks toward 0.4;
  non-finite/missing signals score 0. When in doubt, never Zone 0.
- **ML never overrides the rules.** The neural net produces measurements
  (class + confidence) only. The deterministic scoring/zone logic is the sole
  decision authority — a model output cannot bypass or relax it.
- **Measurement ↔ decision boundary holds.** Perception stages output signals;
  only `scoring.py` decides zones.
- **Service-role key stays on the backend.** `SUPABASE_KEY` (service_role,
  bypasses RLS) is backend-only and must never reach the frontend bundle or be
  committed. Supabase RLS: public read, backend writes via service_role.

## Testing

Before pushing/deploying, run the gate: `scripts/validate-terrasight.sh`
(syntax, imports, scoring self-check, safety regression, contract shapes,
frontend build, git sanity). Required regressions:

- `app/scoring.py` self-check (`python -m app.scoring`)
- `tests/test_safety_regression.py` — false-safe invariants
- `tests/test_contract.py` — frozen contract shapes (endpoint + mock)

A change touching scoring or the contract is not done until these pass. See the
`testing` skill.

## Git conventions

- Work on a branch off `main`; open a PR — never commit straight to `main`.
- Commit/push only when asked. Never commit secrets (the gate greps for a
  committed service-role key).
- Keep diffs scoped to the task; no unrelated refactors.

## Deployment

Vercel monorepo (`vercel.json`): `frontend` (Next.js) + `backend`
(FastAPI `app.main:app`); `/api/backend/*` rewrites to the backend service.
Backend env (`SUPABASE_URL`, `SUPABASE_KEY`) is set in Vercel/CI, never in the
frontend. Unset ⇒ backend serves `backend/mock/*.json` (see `db.py`). See the
`devops-agent` and `vercel:deploy` skill.

## Definition of done

1. Frozen contract respected (or deliberately revised + `test_contract.py` updated).
2. Measurement ↔ decision split preserved; no ML override of the rules.
3. No false-safe path introduced.
4. `scripts/validate-terrasight.sh` passes green.
5. Service-role key isolation intact; no secrets committed.
6. Change scoped; ownership honored; docs/skills updated if behavior changed.
