"""Supabase-backed data access with a mock-JSON fallback.

If SUPABASE_URL + SUPABASE_KEY are set, reads/writes go to Supabase; otherwise
the API serves backend/mock/*.json so the frontend never blocks on provisioning.
Use the service_role key on the backend (it bypasses RLS for writes).
"""
from __future__ import annotations
import json
import os
from pathlib import Path
from functools import lru_cache

MOCK = Path(__file__).resolve().parent.parent / "mock"

# table -> mock file
_MOCK_FILE = {"tiles": "tiles.json", "rover_path": "path.json",
              "sites": "sites.json", "boundaries": "boundaries.json"}


@lru_cache(maxsize=1)
def _client():
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY")
    if not (url and key):
        return None
    from supabase import create_client  # lazy: only needed when configured
    return create_client(url, key)


def fetch(table: str) -> list[dict]:
    sb = _client()
    if sb is None:
        return json.loads((MOCK / _MOCK_FILE[table]).read_text())
    return sb.table(table).select("*").execute().data


def upsert(table: str, rows: list[dict]) -> int:
    """Backend/rover writes fused terrain. No-op if Supabase not configured."""
    sb = _client()
    if sb is None:
        return 0
    sb.table(table).upsert(rows).execute()
    return len(rows)
