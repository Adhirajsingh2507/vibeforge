---
name: testing
description: Testing approach for TerraSight — self-check demos for the deterministic scoring rules, contract-shape checks against backend/mock, and the mock-fallback path in db.py. Use when adding or running tests, verifying scoring invariants, or checking that API output still matches the frozen contract.
---

# testing

Lightweight, no framework overhead unless asked. Match the existing style:
assert-based `_demo()` self-checks.

## What already exists

- `backend/app/scoring.py::_demo()` — asserts scoring invariants (flat →
  Zone 0, crater rim → Zone 3, loose soil → Zone 1, and the safety-critical one:
  low-confidence class is NOT promoted to Zone 0). Run: `python -m app.scoring`
  from `backend/`.
- `db.py` mock fallback is verifiable by running with no `SUPABASE_URL` set —
  `fetch()` returns mock JSON, `upsert()` is a no-op returning 0.

## Constraints

- **Guard the safety invariants first.** Any change to `scoring.py` must keep
  `_demo()` green and add an assertion for the new behavior — the
  uncertain-class-can't-build rule is non-negotiable.
- **Contract tests check shape, not values.** Verify `/map/tiles` etc. still
  emit the frozen keys (`x,y,z,class,slope,safety_score,zone`); mock JSON is the
  reference.
- Keep neural-model evaluation separate — that's `evaluation` (metrics), this is
  correctness/regression of rules + API.
- No heavy frameworks/fixtures unless requested; one runnable check per piece of
  non-trivial logic is enough.
