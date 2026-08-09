"""Mutable financial data layer.

The deterministic finance_engine reads the user's CURRENT financial state from
here (not from immutable constants), so any edit the user makes in the UI is
reflected immediately in every calculation and in the next Gemma agent call --
no model reload, no notebook restart.

Seeded from mock_data. Persisted as JSON (lightweight, no DB). Thread-guarded.

State shape:
    {
      "profile":      {name, monthly_income, savings_balance, emergency_fund,
                       credit_score, currency},
      "transactions": [{id, date, merchant, category, amount}, ...],
      "bills":        [{id, name, due_date, amount, autopay}, ...],
      "investments":  [{id, instrument, value, monthly_contribution, liquid}, ...],
    }
Fraud intel (trusted merchants / patterns) stays static in mock_data -- it is
not user-editable.
"""

from __future__ import annotations

import json
import os
import threading
import uuid
from copy import deepcopy

import mock_data as seed

_DATA_FILE = os.environ.get("CFO_DATA_FILE", "financial_data.json")
_lock = threading.RLock()
_state: dict | None = None
_version = 0          # bumps on every write; used for cache invalidation + context


def version() -> int:
    return _version


def _bump():
    global _version
    _version += 1


def _new_id() -> str:
    return uuid.uuid4().hex[:8]


def _seed_state() -> dict:
    """Build a fresh state from mock_data defaults, assigning stable ids."""
    return {
        "profile": deepcopy(seed.PROFILE),
        "transactions": [{"id": _new_id(), **deepcopy(t)} for t in seed.TRANSACTIONS],
        "bills": [{"id": _new_id(), **deepcopy(b)} for b in seed.UPCOMING_BILLS],
        "investments": [{"id": _new_id(), **deepcopy(i)} for i in seed.INVESTMENTS],
    }


def _load() -> dict:
    global _state
    if _state is not None:
        return _state
    with _lock:
        if _state is not None:
            return _state
        if os.path.exists(_DATA_FILE):
            try:
                with open(_DATA_FILE) as f:
                    _state = json.load(f)
            except Exception:
                _state = _seed_state()
        else:
            _state = _seed_state()
    return _state


def _persist() -> None:
    _bump()                       # every write changes the data version
    try:
        with open(_DATA_FILE, "w") as f:
            json.dump(_state, f, indent=2)
    except Exception:
        pass  # persistence is best-effort; in-memory state is authoritative


# --- reads (used by finance_engine / agents / dashboard) ---------------------

def get_state() -> dict:
    return deepcopy(_load())


def profile() -> dict:
    return _load()["profile"]


def transactions() -> list[dict]:
    return _load()["transactions"]


def bills() -> list[dict]:
    return _load()["bills"]


def investments() -> list[dict]:
    return _load()["investments"]


# --- writes ------------------------------------------------------------------

def patch_profile(patch: dict) -> dict:
    with _lock:
        _load()["profile"].update({k: v for k, v in patch.items() if v is not None})
        _persist()
        return deepcopy(_state["profile"])


def _add(coll: str, item: dict) -> dict:
    with _lock:
        rec = {"id": _new_id(), **item}
        _load()[coll].append(rec)
        _persist()
        return deepcopy(rec)


def _update(coll: str, item_id: str, patch: dict) -> dict | None:
    with _lock:
        for rec in _load()[coll]:
            if rec["id"] == item_id:
                rec.update({k: v for k, v in patch.items() if v is not None})
                _persist()
                return deepcopy(rec)
        return None


def _delete(coll: str, item_id: str) -> bool:
    with _lock:
        items = _load()[coll]
        for i, rec in enumerate(items):
            if rec["id"] == item_id:
                items.pop(i)
                _persist()
                return True
        return False


def add_transaction(item): return _add("transactions", item)
def update_transaction(i, p): return _update("transactions", i, p)
def delete_transaction(i): return _delete("transactions", i)

def add_bill(item): return _add("bills", item)
def update_bill(i, p): return _update("bills", i, p)
def delete_bill(i): return _delete("bills", i)

def add_investment(item): return _add("investments", item)
def update_investment(i, p): return _update("investments", i, p)
def delete_investment(i): return _delete("investments", i)


def replace(coll: str, items: list[dict]) -> list[dict]:
    """Replace an entire collection (used by the editable dashboard tables).
    Re-assigns fresh ids and drops any incoming 'id'."""
    with _lock:
        _load()[coll] = [{"id": _new_id(), **{k: v for k, v in it.items() if k != "id"}}
                         for it in items]
        _persist()
        return deepcopy(_state[coll])


def reset() -> dict:
    """Restore the demo defaults."""
    global _state
    with _lock:
        _state = _seed_state()
        _persist()
        return deepcopy(_state)
