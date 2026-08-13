"""Per-session conversation memory (bounded).

Stores, per chat session: the user/assistant turns plus the *structured* findings
and Judge verdict that produced each answer -- so follow-ups ("why?", "what if it
was 50k?", "that percentage is wrong") can be resolved against real deterministic
results instead of asking Gemma to recreate arithmetic from memory.

Bounded: only the last MAX_TURNS turns are kept and only the last one's full
findings are retained; older turns keep a one-line decision summary. We never
store or expose hidden chain-of-thought -- only safe execution metadata.
"""

from __future__ import annotations

import threading
import uuid

import financial_store as store

MAX_TURNS = 6
_lock = threading.RLock()
_sessions: dict[str, dict] = {}


def new_session() -> str:
    sid = uuid.uuid4().hex[:12]
    with _lock:
        _sessions[sid] = {"turns": []}
    return sid


def _sess(sid: str) -> dict:
    with _lock:
        if sid not in _sessions:
            _sessions[sid] = {"turns": []}
        return _sessions[sid]


def clear(sid: str) -> None:
    with _lock:
        _sessions[sid] = {"turns": []}


def load(sid: str, turns: list[dict]) -> None:
    """Seed a session from an external source (e.g. a decoded signed token),
    so the stateless-token path reuses all the existing follow-up logic."""
    with _lock:
        _sessions[sid] = {"turns": list(turns or [])[-MAX_TURNS:]}


def turns(sid: str) -> list[dict]:
    return _sess(sid)["turns"]


def last_turn(sid: str) -> dict | None:
    t = turns(sid)
    return t[-1] if t else None


def add_turn(sid: str, *, user: str, answer: str, intent: str,
             findings: list[dict] | None = None, verdict: dict | None = None,
             decision_summary: str = "") -> None:
    s = _sess(sid)
    with _lock:
        # compact older turns: drop their heavy findings, keep the one-liner
        for old in s["turns"]:
            old.pop("findings", None)
        s["turns"].append({
            "user": user, "answer": answer, "intent": intent,
            "decision_summary": decision_summary,
            "findings": findings or [],            # full findings only for the latest turn
            "verdict": verdict or {},
            "data_version": store.version(),
        })
        s["turns"] = s["turns"][-MAX_TURNS:]


def last_findings(sid: str) -> list[dict]:
    t = last_turn(sid)
    return (t or {}).get("findings", []) or []


def context_block(sid: str) -> str:
    """Compact, reference-resolvable summary of recent turns for the planner/synth.
    Contains only safe metadata: user text, decision one-liner, agent summaries."""
    t = turns(sid)
    if not t:
        return ""
    stale = any(x.get("data_version") != store.version() for x in t)
    lines = ["Recent conversation (oldest first) -- use it to resolve references "
             "like 'it', 'that', 'why', 'what if':"]
    for x in t[-4:]:
        lines.append(f'- User asked: "{x["user"]}"')
        if x.get("decision_summary"):
            lines.append(f'  Result: {x["decision_summary"]}')
        for f in x.get("findings", [])[:6]:
            if f.get("summary"):
                lines.append(f'  - {f.get("agent")}: {f["summary"]}')
    if stale:
        lines.append("NOTE: the user's financial data has changed since an earlier "
                     "turn; recompute rather than reusing old numbers.")
    return "\n".join(lines)
