"""Judge Agent -- the Reflection pattern (Luqman et al. sec 4.1).

Distinct from the orchestrator: it does NOT re-plan. It validates the collected
agent findings against hard financial guardrails.

Crucially it separates two things that must never be conflated:

  * response_ok     -- is the RECOMMENDATION well-founded? (did relevant agents
                       run, are findings internally consistent). This is what a
                       "validated answer" badge should reflect. A correct "do NOT
                       buy" answer to a fraud query is response_ok = True.
  * transaction_safe-- is the PURCHASE/ACTION itself financially safe? (no fraud,
                       within EMI limits, emergency fund intact). This is an
                       advisory about the world, not a judgement of the answer.

So the fraud demo now reads: response_ok=True (great answer) + transaction_safe=
False (dangerous purchase) -- no more misleading "approved=False" on a good reply.

Guardrails are deterministic (rule-based validation of LLM reasoning -- the
mitigation named in the brief); pass/fail is never delegated to the model.
The orchestrator bounds any revision loop to <= 2 iterations.
"""

from __future__ import annotations

import finance_engine as fe


def evaluate(findings: list[dict]) -> dict:
    """findings: list of agent result dicts. Returns a two-axis verdict."""
    advisories: list[str] = []       # financial RISK flags about the transaction
    inconsistencies: list[str] = []  # problems with the RESPONSE/plan itself

    # --- transaction-safety advisories ---
    loan = next((f for f in findings if f.get("agent") == "Loan"), None)
    if loan and not loan.get("within_safe_limit", True):
        advisories.append(
            f"EMI-to-income ratio is {loan.get('emi_to_income_ratio_display', '—')}, above the "
            f"{int(fe.EMI_RATIO_MAX*100)}% safe limit. Prefer a longer tenure or lower principal."
        )

    afford = next((f for f in findings if f.get("agent") == "Budget/Affordability"), None)
    if afford and not afford.get("emergency_fund_intact", True):
        advisories.append(
            "Paying outright would breach the 3-month emergency-fund floor. "
            "Prefer financing or defer the purchase."
        )

    fraud = next((f for f in findings if f.get("agent") == "Fraud"), None)
    high_fraud = bool(fraud and fraud.get("risk") in {"HIGH", "CRITICAL"})
    if high_fraud:
        advisories.append(
            f"Fraud risk is {fraud['risk']} for '{fraud.get('target')}'. "
            "Do not proceed with payment; verify the seller first."
        )

    # --- response/plan validity ---
    if not findings:
        inconsistencies.append(
            "No agents produced findings; the orchestrator must invoke relevant agents."
        )

    # Risk level for the UI (about the transaction, not the answer).
    if high_fraud:
        risk_level = "high"
    elif advisories:
        risk_level = "caution"
    else:
        risk_level = "safe"

    transaction_safe = len(advisories) == 0
    response_ok = len(inconsistencies) == 0 and len(findings) > 0

    # Confidence reflects how well-SUPPORTED the recommendation is (coverage +
    # clarity), NOT how risky the purchase is. A clear fraud block is high-confidence.
    confidence = round(min(0.95, 0.6 + 0.1 * len(findings)) if response_ok else 0.3, 2)

    # Only worth a revision pass if the response is incomplete/inconsistent, or an
    # advisory the model could plausibly design around (affordability/EMI) exists.
    addressable = any("EMI" in a or "emergency-fund" in a for a in advisories)
    revision_suggested = (not response_ok) or addressable

    return {
        "response_ok": response_ok,
        "transaction_safe": transaction_safe,
        "risk_level": risk_level,               # 'safe' | 'caution' | 'high'
        "confidence": confidence,
        "advisories": advisories,               # transaction risk flags to SURFACE
        "inconsistencies": inconsistencies,     # response problems to FIX
        "revision_suggested": revision_suggested,
        "revision_request": (" ".join(inconsistencies + advisories)
                             if revision_suggested else None),
        "agents_seen": [f.get("agent", "?") for f in findings],
    }
