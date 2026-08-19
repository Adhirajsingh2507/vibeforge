---
name: supabase
description: TerraSight's Supabase Postgres persistence — the tiles/rover_path/sites/boundaries schema with RLS in backend/supabase/schema.sql, and the data-access layer in backend/app/db.py that reads/writes Supabase or falls back to mock JSON. Use when changing the schema, RLS policies, the db access layer, or environment configuration.
---

# supabase

Persistence for the terrain products. Schema: `backend/supabase/schema.sql`.
Access layer: `backend/app/db.py`.

## Schema (mirrors the frozen contract)

Tables: `tiles` (unique `x,y`), `rover_path` (pk `t`), `sites` (pk `id`),
`boundaries` (`type`, `polyline` jsonb). See schema.sql for columns.

## Security model (do not weaken)

- **RLS enabled on every table; public `SELECT` only** for `anon` +
  `authenticated` — the dashboard reads publicly.
- **No write policies exist, by design.** The backend/rover writes with the
  `service_role` key, which bypasses RLS. Never add anon/authenticated write
  policies; never expose the service_role key to the frontend.

## Access layer (`db.py`)

- `fetch(table)` / `upsert(table, rows)`.
- If `SUPABASE_URL` + `SUPABASE_KEY` (service role) are set → Supabase; else
  falls back to `backend/mock/*.json` so nothing blocks on provisioning.
- `_client()` is `lru_cache`d and imports `supabase` lazily. `upsert` is a
  no-op when unconfigured (returns 0).

## Constraints

- Keep column names aligned with the contract (`terrain_class` in DB maps to
  `class` in the JSON contract — preserve that mapping).
- Env config: `SUPABASE_URL` + `SUPABASE_KEY` — see `backend/.env.example`.
  `.mcp.json` registers the Supabase MCP server (OAuth on session reload).
- Preserve the mock-fallback path; it's what keeps the demo deployable.
