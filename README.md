# TerraSight

Onboard Edge-AI perception for autonomous planetary rovers. Turns stereo + RGB
camera feeds into a live 3D terrain map, classifies every patch into decision
zones, and scores it for construction — without waiting on Earth.

**SIH · Space Technology · Computer Vision / Robotics**

## Repo layout

```
backend/      # CV + AI + API (Python, FastAPI)  — owned by backend/ML
  app/        # segmentation, depth, zones, scoring, api
  mock/       # frozen API contract (mock JSON the frontend builds against)
frontend/     # 3D mission dashboard (Next.js + Three.js) — deploys to Vercel
```

## The API contract (frozen day 1)

Frontend builds against `backend/mock/*.json` in these exact shapes, then we swap
the mock for the live FastAPI endpoints.

| Endpoint | Returns |
|---|---|
| `GET /map/tiles`   | `[{ x, y, z, class, slope, safety_score, zone }]` |
| `GET /rover/path`  | `[{ t, x, y, heading, mode }]` |
| `GET /sites`       | `[{ id, x, y, safety_score, rank }]` |
| `GET /boundaries`  | `[{ type, polyline }]` |

## Status

- ✅ Core segmentation + depth pipeline on simulated datasets
- 🔧 Zone classification + Safety Score algorithm
- ⏭ Live dashboard integration + depth-map calibration on more datasets

## Zones

| Zone | Meaning |
|---|---|
| 0 | Construction-safe (flat, compact, high bearing) |
| 1 | Navigation-only (drivable, unsafe to build) |
| 2 | Geological interest (water beds, ice, minerals) |
| 3 | Hazardous (crater rims, slopes, boulders) |

Precedence when signals conflict: **hazard > geological > navigation > safe**.

## Supabase (persistence)

Terrain products (tiles, sites, boundaries, rover path) persist in Supabase
Postgres. Schema + RLS: `backend/supabase/schema.sql` (public read for the
dashboard; backend writes via service_role).

- **MCP:** `.mcp.json` registers the Supabase MCP server — reload the session and
  complete the OAuth flow to expose Supabase tools.
- **Backend:** set `SUPABASE_URL` + `SUPABASE_KEY` (service role) — see
  `backend/.env.example`. Unset = falls back to `backend/mock/*.json`.
