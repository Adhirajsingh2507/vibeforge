"""Shared service layer: one loaded model, reused across the app.

api.py (FastAPI, which also serves the SPA in web/) imports from here, so the
Gemma backend loads exactly once and no financial calculation is duplicated
outside the engine.

Backend selection via env GEMMA_BACKEND:
    auto          -> transformers if a GPU is visible, else echo   (default)
    transformers  -> force Gemma 4 on GPU
    echo          -> silent CPU stub (no tool calls)
    demo          -> CPU stub that keyword-routes to real agents so the FULL UI
                     is demoable with no GPU (used for local testing).
"""

from __future__ import annotations

import os
from dataclasses import asdict

from llm import GenResult, make_backend, parse_tool_calls, strip_tool_calls
from orchestrator import Advice, Orchestrator, dashboard_snapshot

_orch: Orchestrator | None = None


# --- a CPU demo backend so the UI works without a GPU -------------------------

def _demo_script(messages, tools):
    q = messages[-1]["content"]
    if isinstance(q, list):
        q = " ".join(p.get("text", "") for p in q if isinstance(p, dict))
    ql = q.lower()

    if tools is None:  # synthesis turn
        return GenResult(text="Here is your CFO's recommendation based on the agents' "
                              "findings above. See the trace for how each specialist "
                              "contributed.")

    calls = []
    if any(w in ql for w in ("fraud", "safe", "website", ".xyz", "scam", "http")):
        import re
        m = re.search(r"[\w.-]+\.(?:xyz|top|click|com|in|buzz)\b", ql)
        calls.append(f'<|tool_call>call:check_fraud_risk{{target:"{m.group(0) if m else q}"}}<tool_call|>')
    if any(w in ql for w in ("afford", "buy", "purchase", "iphone", "laptop")):
        import re
        amt = re.search(r"(\d[\d,]{3,})", ql.replace(",", ""))
        a = amt.group(1) if amt else "90000"
        calls.append(f'<|tool_call>call:check_affordability{{amount:"{a}"}}<tool_call|>')
        calls.append(f'<|tool_call>call:evaluate_loan{{principal:"{a}"}}<tool_call|>')
    if any(w in ql for w in ("bill", "due", "reminder")):
        calls.append('<|tool_call>call:check_upcoming_bills{}<tool_call|>')
    if any(w in ql for w in ("invest", "sip", "stock", "mutual")):
        calls.append('<|tool_call>call:review_investments{}<tool_call|>')
    if any(w in ql for w in ("budget", "spend", "expense", "save")):
        calls.append('<|tool_call>call:analyze_budget{}<tool_call|>')
    if not calls:
        calls.append('<|tool_call>call:analyze_budget{}<tool_call|>')

    raw = "Consulting the relevant specialists. " + "".join(calls)
    return GenResult(text=strip_tool_calls(raw), tool_calls=parse_tool_calls(raw))


def set_orchestrator(orch: Orchestrator) -> None:
    """Inject an already-built Orchestrator (e.g. one wrapping a model the Kaggle
    notebook already loaded) so the API/UI reuse it instead of loading a 2nd copy."""
    global _orch
    _orch = orch


def get_orchestrator() -> Orchestrator:
    global _orch
    if _orch is None:
        kind = os.environ.get("GEMMA_BACKEND", "auto")
        if kind == "demo":
            from llm import EchoBackend
            backend = EchoBackend(_demo_script)
        else:
            backend = make_backend(kind)
        use_judge = os.environ.get("CFO_USE_JUDGE", "1") != "0"
        _orch = Orchestrator(backend, use_judge=use_judge, max_iterations=2)
    return _orch


def advise(query: str, session_id: str | None = None) -> dict:
    """Run one query through the orchestrator; return a JSON-able dict.

    Security: the raw 'reasoning' (Gemma's chain-of-thought) is stripped from the
    trace before it leaves the backend. The UI only ever sees safe execution
    metadata -- which agents ran, their deterministic result summaries, and the
    Judge verdict."""
    result: Advice = get_orchestrator().advise(query, session_id=session_id)
    payload = asdict(result)
    for step in payload.get("trace", []):
        step.pop("reasoning", None)  # never expose hidden reasoning / thought tokens
    # findings can be large/nested; the UI only needs summaries, which are in trace.
    payload["findings"] = [{"agent": f.get("agent"), "summary": f.get("summary")}
                           for f in payload.get("findings", [])]
    return payload


# --- conversation sessions ---
def new_session() -> dict:
    import conversation
    return {"session_id": conversation.new_session()}


def clear_session(session_id: str) -> dict:
    import conversation
    conversation.clear(session_id)
    return {"cleared": session_id}


# --- dashboard (cached until financial data changes) ---
_dash_cache = {"version": None, "data": None}


def dashboard() -> dict:
    import financial_store as store
    v = store.version()
    if _dash_cache["version"] != v:
        _dash_cache["data"] = dashboard_snapshot()
        _dash_cache["version"] = v
    return _dash_cache["data"]


def health() -> dict:
    kind = os.environ.get("GEMMA_BACKEND", "auto")
    backend = get_orchestrator().llm
    return {
        "status": "ok",
        "backend": type(backend).__name__,
        "backend_kind": kind,
        "load_mode": getattr(backend, "load_mode", None),
        "model": getattr(backend, "model_id", None),
        "judge_enabled": get_orchestrator().use_judge,
    }
