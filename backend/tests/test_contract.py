"""TerraSight frozen API contract tests.

The frontend is built against these exact response shapes — they are FROZEN.
This locks them at two layers so drift fails loudly:

  1. endpoint layer — what app.main.* actually returns
  2. mock layer     — backend/mock/*.json, the fallback source

Any added/removed/renamed key here is a breaking change to the frontend and
must be a deliberate, coordinated contract revision (see CLAUDE.md).

Runnable two ways:
    python backend/tests/test_contract.py     # plain asserts
    pytest backend/tests                       # collected as test_*
"""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app import main                                       # noqa: E402
from app.scoring import CLASS_BEARING                      # noqa: E402

# --- the frozen contract: endpoint -> (accessor, mock file, exact key set) ---
CONTRACT = {
    "tiles":      (main.map_tiles,  "tiles.json",
                   {"x", "y", "z", "class", "slope", "safety_score", "zone"}),
    "rover_path": (main.rover_path, "path.json",
                   {"t", "x", "y", "heading", "mode"}),
    "sites":      (main.sites,      "sites.json",
                   {"id", "x", "y", "safety_score", "rank"}),
    "boundaries": (main.boundaries, "boundaries.json",
                   {"type", "polyline"}),
}
MOCK = Path(__file__).resolve().parent.parent / "mock"


def _check_rows(rows, keys, name):
    assert isinstance(rows, list) and rows, f"{name}: expected non-empty list"
    for i, row in enumerate(rows):
        assert isinstance(row, dict), f"{name}[{i}]: not an object"
        extra, missing = set(row) - keys, keys - set(row)
        assert not missing, f"{name}[{i}] missing keys: {missing}"
        assert not extra, f"{name}[{i}] has unfrozen keys: {extra}"


def test_endpoint_shapes():
    """Every served endpoint matches the frozen key set exactly."""
    for name, (accessor, _mock, keys) in CONTRACT.items():
        _check_rows(accessor(), keys, name)


def test_mock_shapes():
    """The mock fallback files match the same frozen key set (backend vs mock)."""
    for name, (_accessor, mock_file, keys) in CONTRACT.items():
        rows = json.loads((MOCK / mock_file).read_text())
        _check_rows(rows, keys, f"mock/{mock_file}")


def test_health_shape():
    h = main.health()
    assert set(h) == {"status", "source"}, h
    assert h["status"] == "ok" and h["source"] in ("supabase", "mock"), h


def test_tile_value_domains():
    """Tiles carry decision output — zone must be 0..3 and class in taxonomy."""
    for i, t in enumerate(main.map_tiles()):
        assert t["zone"] in (0, 1, 2, 3), f"tiles[{i}] bad zone {t['zone']}"
        assert 0.0 <= t["safety_score"] <= 1.0, f"tiles[{i}] score out of [0,1]"
        assert t["class"] in CLASS_BEARING, f"tiles[{i}] unknown class {t['class']}"


if __name__ == "__main__":
    test_endpoint_shapes()
    test_mock_shapes()
    test_health_shape()
    test_tile_value_domains()
    print("contract ok")
