# TerraSight — Project Rules

Onboard Edge-AI perception for autonomous planetary rovers. Turns stereo + RGB
camera feeds into a live terrain map, classifies every cell into decision zones,
and scores it for construction — **on the rover, without waiting on Earth**.

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
Score is the **only decision layer**. The two must not blur.

## Directory Ownership

| Path | Owner |
|------|-------|
| `backend/app/main.py` | backend-agent (API) |
| `backend/app/scoring.py` | terrain-intelligence-agent (decision layer) |
| `backend/app/guards.py` | terrain-intelligence-agent (trust gates) |
| `backend/app/db.py` | database-agent |
| `backend/supabase/` | database-agent |
| `backend/mock/`, `gen_mock.py` | dataset-agent |
| `backend/tests/` | testing-agent |
| `frontend/` | UI development |

Perception stages (`perception/`, `depth/`, `slam/`, `terrain/`) belong to their
named agents.

## API Contract (FROZEN)

The frontend builds against these exact shapes. Adding/removing/renaming a key
is a breaking change.

| Endpoint | Returns (row shape) |
|----------|---------------------|
| `GET /health` | `{status, source}` |
| `GET /map/tiles` | `[{x, y, z, class, slope, safety_score, zone}]` |
| `GET /rover/path` | `[{t, x, y, heading, mode}]` |
| `GET /sites` | `[{id, x, y, safety_score, rank}]` |
| `GET /boundaries` | `[{type, polyline}]` |

Coordinates are world-grid metres; `t` is a frame/tick index; `heading` degrees.
Frontend and backend communicate **only** through this contract.

## Terrain Classes

Segmentation taxonomy: `compact_soil`, `soil`, `loose_soil`, `rock`, `crater`,
`shadow`, `waterbed`, `mineral_edge`, `unknown`.

## Zones (0–3)

Precedence: **hazard > geological > navigation > construction-safe**

- **Zone 0 — Construction-safe:** confident buildable class, sub-threshold slope
  & roughness, clear of crater margin, score ≥ threshold.
- **Zone 1 — Navigation:** drivable but not buildable (default).
- **Zone 2 — Geological:** `waterbed` / `mineral_edge` — protected.
- **Zone 3 — Hazard:** crater, steep slope, boulder, or inside crater keep-out.

## Invariants (NON-NEGOTIABLE)

1. **No false-safe.** Uncertain perception degrades toward neutral and can
   **never** force a buildable zone. Low class-confidence shrinks toward 0.4;
   non-finite/missing signals score 0.
2. **ML never overrides the rules.** The neural net produces measurements only.
   The deterministic scoring/zone logic is the sole decision authority.
3. **Measurement ↔ decision boundary holds.** Perception stages output signals;
   only `scoring.py` decides zones.
4. **Service-role key stays on the backend.** `SUPABASE_KEY` must never reach the
   frontend bundle or be committed.

## Testing

Run `scripts/validate-terrasight.sh` before pushing. Required regressions:
- `app/scoring.py` self-check (`python -m app.scoring`)
- `tests/test_safety_regression.py` — false-safe invariants
- `tests/test_contract.py` — frozen contract shapes

## Tech Stack

- **Backend:** Python, FastAPI, OpenCV, PyTorch/TensorFlow
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Three.js
- **Persistence:** Supabase Postgres (mock JSON fallback)
- **Deployment:** Vercel monorepo
