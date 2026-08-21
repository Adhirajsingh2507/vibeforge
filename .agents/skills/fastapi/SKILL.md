---
name: fastapi
description: The TerraSight FastAPI service in backend/app/main.py that serves the frozen frontend contract (/map/tiles, /rover/path, /sites, /boundaries, /health). Use when adding or changing API endpoints, CORS, request/response shapes, or wiring perception output to the served contract.
---

# fastapi

The API layer. `backend/app/main.py`. Serves the **frozen contract** the
frontend builds against.

## Endpoints (frozen — see README + backend/mock)

| Endpoint | Returns |
|---|---|
| `GET /map/tiles`  | `[{ x, y, z, class, slope, safety_score, zone }]` |
| `GET /rover/path` | `[{ t, x, y, heading, mode }]` |
| `GET /sites`      | `[{ id, x, y, safety_score, rank }]` |
| `GET /boundaries` | `[{ type, polyline }]` |
| `GET /health`     | `{ status, source }` (`source` = supabase\|mock) |

Run from `backend/`: `uvicorn app.main:app --reload`.

## Constraints

- **Never change the contract field names/types.** The frontend builds against
  `backend/mock/*.json` in these exact shapes. Additive-only if unavoidable,
  and coordinate before doing even that.
- Endpoints stay thin: they delegate all data access to `app.db` (`db.fetch`).
  Don't put perception, scoring, or DB logic in `main.py`.
- Data source is transparent — Supabase when configured, mock JSON otherwise
  (`app/db.py`). `/health` reports which; keep that working for debugging.
- CORS is currently open (`allow_origins=["*"]`) for the dashboard — fine for
  the demo; note it's not production-hardened.
- Don't add new endpoints the frontend contract doesn't need (YAGNI).
