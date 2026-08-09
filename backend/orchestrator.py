"""Finance Orchestrator -- intent routing + Planning + ReAct + Reflection.

Every message is routed (router.py) so cheap questions stay cheap:
  * FAST_DATA        -> deterministic lookup, 0 Gemma generations
  * FOLLOWUP_EXPLAIN -> reuse prior findings + 1 short synthesis (no tools)
  * FRAUD            -> fraud agent + deterministic Judge + 1 synthesis
  * DECISION/WHATIF  -> 1 planning gen + agents + deterministic Judge + 1 synthesis
                        (a 2nd planning gen ONLY if the Judge finds no usable findings)

Normal financial decision = 2 Gemma generations. Gemma never does arithmetic and
never phrases the Judge's pass/fail. Per-stage timings + generation counts are
recorded for debug (not shown in the normal UI). Conversation memory makes
follow-ups ("why?", "what if 50k?") resolve against real prior findings.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field

import conversation
import judge
import financial_store as store
import router
from agents import AGENT_TOOLS, run_agent
from formatting import fmt_inr, fmt_pct

# Token budgets by operation -- a tool-selection prompt must not use a 512+ budget.
PLAN_TOKENS = 200
SYNTH_TOKENS = 340
FOLLOWUP_TOKENS = 260


def build_system() -> str:
    """Built per-request so it always reflects the CURRENT (possibly edited) profile."""
    p = store.profile()
    return (
        "You are the Finance Orchestrator, the CFO of a multi-agent personal-finance "
        "system. You do NOT do arithmetic yourself. Decide which specialist agents to "
        "call to answer the user's financial question, then explain their findings "
        "clearly and conversationally. Available agents: budget, bills, loan, fraud, "
        "affordability, investment, tax. Call only the agents the question needs. "
        f"User profile: income Rs.{p['monthly_income']:,}/mo, "
        f"savings Rs.{p['savings_balance']:,}, CIBIL {p['credit_score']}."
    )


@dataclass
class Advice:
    answer: str
    confidence: float
    trace: list[dict] = field(default_factory=list)
    findings: list[dict] = field(default_factory=list)
    judge_verdict: dict | None = None
    iterations: int = 1
    session_id: str | None = None
    intent: str = "DECISION"
    gemma_calls: int = 0
    timings: dict = field(default_factory=dict)


class Orchestrator:
    def __init__(self, llm, use_judge: bool = True, max_iterations: int = 2,
                 thinking_planning: bool = False):
        self.llm = llm
        self.use_judge = use_judge
        self.max_iterations = max_iterations
        # enable_thinking makes tool-selection slower; default off for routing.
        # Benchmark on real Gemma before enabling globally (see notebook Section 9).
        self.thinking_planning = thinking_planning

    # ---- public entrypoint: route, dispatch, record ----
    def advise(self, query: str, session_id: str | None = None, image=None) -> Advice:
        prof = {"timings": {}, "calls": 0}

        def gen(messages, tools=None, max_new_tokens=256, thinking=False, label="gemma"):
            t0 = time.perf_counter()
            r = self.llm.generate(messages, tools=tools,
                                  image=image if tools else None,
                                  max_new_tokens=max_new_tokens, enable_thinking=thinking)
            prof["timings"][label] = round(prof["timings"].get(label, 0) + time.perf_counter() - t0, 3)
            prof["calls"] += 1
            return r

        has_history = bool(session_id and conversation.turns(session_id))
        route = router.classify(query, has_history)
        intent = route["intent"]

        t0 = time.perf_counter()
        if intent == router.FAST_DATA:
            adv = self._fast_data(route)
        elif intent == router.FOLLOWUP_EXPLAIN:
            adv = self._followup_explain(query, session_id, gen)
        elif intent == router.FRAUD:
            adv = self._fraud(query, route, gen)
        else:  # DECISION / FOLLOWUP_WHATIF / COMPLEX
            adv = self._decision(query, session_id, has_history, gen)
        prof["timings"]["total"] = round(time.perf_counter() - t0, 3)

        adv.intent = intent
        adv.session_id = session_id
        adv.gemma_calls = prof["calls"]
        adv.timings = prof["timings"]
        if session_id:
            conversation.add_turn(session_id, user=query, answer=adv.answer, intent=intent,
                                  findings=adv.findings, verdict=adv.judge_verdict,
                                  decision_summary=_decision_summary(adv))
        return adv

    # ---- FAST_DATA: deterministic lookup, zero Gemma ----
    def _fast_data(self, route) -> Advice:
        d = dashboard_snapshot()
        f = route.get("field")
        b, ef, iv = d["budget"], d["emergency_fund"], d["investments"]
        ef_tail = ("adequate" if ef["adequate"]
                   else "below the 3-month target of " + fmt_inr(ef["recommended_minimum"]))
        bills_list = ", ".join(f"{x['name']} {fmt_inr(x['amount'])} (in {x['days_until']}d)"
                               for x in d["bills"]["upcoming_bills"])
        ans = {
            "cibil": f"Your CIBIL score is {d['cibil']['score']} ({d['cibil']['band']}).",
            "income": f"Your monthly income is {fmt_inr(b['income'])}.",
            "savings": f"Your savings balance is {fmt_inr(d['profile']['savings_balance'])}.",
            "expenses": f"Your monthly expenses are {fmt_inr(b['expenses'])}.",
            "disposable": f"Your disposable income is {fmt_inr(b['disposable'])}/month "
                          f"({fmt_inr(b['income'])} income minus {fmt_inr(b['expenses'])} expenses).",
            "bills": f"You have {fmt_inr(d['bills']['total_upcoming'])} in upcoming bills across "
                     f"{len(d['bills']['upcoming_bills'])} items: {bills_list}.",
            "investments": f"You have {fmt_inr(iv['total_invested'])} invested "
                           f"({fmt_inr(iv['liquid_value'])} liquid), SIP {fmt_inr(iv['monthly_sip'])}/mo.",
            "emergency": f"Your emergency fund is {fmt_inr(ef['emergency_fund'])}, covering "
                         f"{ef['months_covered_display']} months ({ef_tail}).",
            "emi": f"Your existing EMI is {fmt_inr(d['existing_emi'])}, which is "
                   f"{fmt_pct(d['emi_to_income_pct'])} of your monthly income.",
        }.get(f)
        if ans is None:
            ans = "Here is your current financial position — see the dashboard for details."
        trace = [{"step": "lookup", "field": f, "summary": ans}]
        verdict = {"response_ok": True, "transaction_safe": None, "risk_level": "n/a",
                   "confidence": 1.0, "advisories": []}
        return Advice(answer=ans, confidence=1.0, trace=trace, findings=[],
                      judge_verdict=verdict)

    # ---- FOLLOWUP_EXPLAIN: reuse prior findings, 1 short synthesis, no tools ----
    def _followup_explain(self, query, session_id, gen) -> Advice:
        findings = conversation.last_findings(session_id)
        ctx = conversation.context_block(session_id)
        prov = _provenance_block(findings)
        summaries = "\n".join(f"- {x.get('agent')}: {x.get('summary')}" for x in findings)
        msgs = [
            {"role": "system", "content": build_system()},
            {"role": "user", "content": ctx},
            {"role": "user", "content":
                f"Follow-up question: \"{query}\"\n\n"
                "Answer conversationally and briefly (no fresh full analysis). Explain "
                "using ONLY these already-computed deterministic results and their "
                "calculations. Do NOT invent or recompute any number.\n\n"
                f"Findings:\n{summaries}\n\nCalculations:\n{prov}"},
        ]
        r = gen(msgs, max_new_tokens=FOLLOWUP_TOKENS, label="followup")
        last = conversation.last_turn(session_id) or {}
        verdict = last.get("verdict") or {"response_ok": True, "transaction_safe": None,
                                          "risk_level": "n/a", "confidence": 0.8, "advisories": []}
        answer = r.text or (summaries or "Here is the explanation of the earlier result.")
        trace = [{"step": "context", "summary": "Reusing previous agent findings"},
                 {"step": "synthesise", "answer": answer}]
        return Advice(answer=answer, confidence=verdict.get("confidence", 0.8),
                      trace=trace, findings=findings, judge_verdict=verdict)

    # ---- FRAUD: fraud agent + Judge + 1 concise synthesis ----
    def _fraud(self, query, route, gen) -> Advice:
        target = _extract_target(query)
        finding = run_agent("check_fraud_risk", {"target": target})
        verdict = judge.evaluate([finding])
        trace = [{"step": "agent", "iteration": 1, "agent": "Fraud",
                  "tool": "check_fraud_risk", "arguments": {"target": target},
                  "summary": finding.get("summary", "")},
                 {"step": "judge", "iteration": 1, "response_ok": verdict["response_ok"],
                  "transaction_safe": verdict["transaction_safe"],
                  "risk_level": verdict["risk_level"], "confidence": verdict["confidence"],
                  "advisories": verdict["advisories"]}]
        msgs = [{"role": "system", "content": build_system()},
                {"role": "user", "content":
                    f"User asked: \"{query}\"\nThe deterministic Fraud agent found: "
                    f"{finding.get('summary')}\nReasons: {', '.join(finding.get('reasons', []))}\n"
                    "Give a concise, direct safety recommendation. Do not invent details."}]
        r = gen(msgs, max_new_tokens=FOLLOWUP_TOKENS, label="synthesis")
        answer = r.text or finding.get("summary", "")
        trace.append({"step": "synthesise", "answer": answer})
        return Advice(answer=answer, confidence=verdict["confidence"], trace=trace,
                      findings=[finding], judge_verdict=verdict)

    # ---- DECISION / WHATIF / COMPLEX: planner + agents + Judge + synthesis ----
    def _decision(self, query, session_id, has_history, gen) -> Advice:
        system = build_system()
        ctx = conversation.context_block(session_id) if has_history else ""
        base = [{"role": "system", "content": system}]
        if ctx:
            base.append({"role": "user", "content": ctx})
        messages = base + [{"role": "user", "content": query}]
        trace, findings, verdict, iteration = [], [], None, 1

        for iteration in range(1, self.max_iterations + 1):
            plan = gen(messages, tools=AGENT_TOOLS, max_new_tokens=PLAN_TOKENS,
                       thinking=self.thinking_planning, label="planning")
            trace.append({"step": "plan", "iteration": iteration,
                          "agents_selected": [c["name"] for c in plan.tool_calls]})
            iter_findings = []
            for call in plan.tool_calls:
                result = run_agent(call["name"], call.get("arguments", {}))
                iter_findings.append(result)
                trace.append({"step": "agent", "iteration": iteration,
                              "agent": result.get("agent", call["name"]),
                              "tool": call["name"], "arguments": call.get("arguments", {}),
                              "summary": result.get("summary", "")})
            findings = iter_findings or findings

            if not self.use_judge:
                verdict = {"response_ok": True, "transaction_safe": None, "risk_level": "n/a",
                           "confidence": 0.75, "advisories": [], "inconsistencies": [],
                           "revision_suggested": False, "revision_request": None}
                break
            verdict = judge.evaluate(findings)
            trace.append({"step": "judge", "iteration": iteration,
                          "response_ok": verdict["response_ok"],
                          "transaction_safe": verdict["transaction_safe"],
                          "risk_level": verdict["risk_level"],
                          "confidence": verdict["confidence"], "advisories": verdict["advisories"]})
            # Revision ONLY when the Judge finds the response unusable (no findings) --
            # advisories are surfaced, not re-planned. Keeps the normal case at 2 gens.
            if verdict["response_ok"] or iteration == self.max_iterations:
                break
            messages.append({"role": "user", "content":
                "You did not call any agent. Call the relevant specialist agents to "
                "answer the question."})

        summaries = "\n".join(f"- {f.get('agent')}: {f.get('summary')}" for f in findings)
        synth_msgs = base + [
            {"role": "user", "content": query},
            {"role": "user", "content":
                ("Answer conversationally, continuing the discussion (do not restart a "
                 "full analysis). " if has_history else
                 "Write a clear, explainable recommendation. ")
                + "Base it ONLY on these agent findings; state the decision plainly and "
                "end with one concrete recommendation. Do not invent numbers.\n\n"
                f"Findings:\n{summaries}"},
        ]
        final = gen(synth_msgs, max_new_tokens=SYNTH_TOKENS, label="synthesis")
        answer = final.text or _fallback_answer(findings, verdict)
        trace.append({"step": "synthesise", "answer": answer})
        return Advice(answer=answer, confidence=verdict["confidence"] if verdict else 0.75,
                      trace=trace, findings=findings, judge_verdict=verdict, iterations=iteration)


def _fallback_answer(findings, verdict) -> str:
    lines = ["Based on your agents' analysis:"]
    lines += [f"- {f.get('agent')}: {f.get('summary')}" for f in findings]
    if verdict and verdict.get("advisories"):
        lines.append("Cautions: " + "; ".join(verdict["advisories"]))
    return "\n".join(lines)


def _provenance_block(findings) -> str:
    """Deterministic calculation provenance so explanations cite real math."""
    out = []
    for f in findings:
        c = f.get("calculation")
        if c:
            out.append(f"- {f.get('agent')}: {c['formula']} with {c['inputs']}")
        if f.get("agent") == "Budget/Affordability":
            out.append(f"  {fmt_inr(f['purchase_amount'])} / {fmt_inr(f['savings_before'])} "
                       f"= {f['savings_percentage_display']} of savings")
    return "\n".join(out) or "(no stored calculations)"


def _decision_summary(adv: Advice) -> str:
    v = adv.judge_verdict or {}
    parts = []
    for f in adv.findings:
        if f.get("agent") == "Budget/Affordability":
            parts.append(f"{f['verdict'].replace('_', ' ')}; "
                         f"{fmt_inr(f['purchase_amount'])} = {f['savings_percentage_display']} of savings")
        if f.get("agent") == "Loan":
            parts.append(f"EMI {fmt_inr(f['new_emi'])}/mo, ratio {f.get('emi_to_income_ratio_display', '—')}")
    if v:
        parts.append(f"transaction_safe={v.get('transaction_safe')} risk={v.get('risk_level')}")
    return "; ".join(parts)


_TARGET_RE = re.compile(r"([\w-]+\.(?:xyz|top|click|buzz|com|in|net|org|io|co)\b|@\w+|https?://\S+)", re.I)


def _extract_target(query: str) -> str:
    m = _TARGET_RE.search(query)
    if m:
        return m.group(1)
    # fall back to a quoted phrase or the last capitalised token(s)
    q = re.sub(r"\b(is|it|safe|to|pay|on|for|the|a|an|this|merchant|website|link)\b", "", query, flags=re.I)
    return q.strip(" ?.\"'") or query


def dashboard_snapshot() -> dict:
    """Deterministic full picture for the UI dashboard -- no LLM involved.
    Reads the CURRENT store, so it reflects every edit immediately."""
    import finance_engine as fe
    from agents import check_upcoming_bills, review_investments
    p = store.profile()
    income = p["monthly_income"]
    total_emi = fe.existing_emi()
    return {
        "profile": p,
        "cibil": {"score": p["credit_score"],
                  "band": fe.cibil_band(p["credit_score"]),
                  "min": fe.CIBIL_MIN, "max": fe.CIBIL_MAX},
        "budget": {"income": income,
                   "expenses": fe.monthly_expenses(),
                   "disposable": fe.disposable_income(),
                   "by_category": fe.spend_by_category()},
        "emergency_fund": fe.emergency_fund_status(),
        "bills": check_upcoming_bills(),
        "investments": review_investments(),
        "existing_emi": total_emi,
        "emi_to_income_pct": round(100 * total_emi / income, 1) if income > 0 else None,
    }
