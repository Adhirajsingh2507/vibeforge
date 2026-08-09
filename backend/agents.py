"""The seven specialist agents, each exposed as a Gemma 4 tool.

An "agent" here is: (1) a deterministic Python function over finance_engine, and
(2) a JSON tool schema the orchestrator hands to Gemma 4. The LLM decides *which*
to call and *why*; the function decides the numbers. This is the Tool-Use pattern
(reasoning in the model, computation in code) from Luqman et al. sec 4.1/4.3.

Every agent returns a dict with a 'summary' the Judge and final synthesis read,
plus structured fields for the dashboard.
"""

from __future__ import annotations

import finance_engine as fe
import financial_store as store
from formatting import fmt_inr, fmt_pct


# --- agent implementations ---------------------------------------------------

def analyze_budget(purchase_amount: float = 0) -> dict:
    disp = fe.disposable_income()
    ef = fe.emergency_fund_status()
    cats = fe.spend_by_category()
    overspend = {k: v for k, v in cats.items() if k == "restaurants" and v > 6000}
    return {
        "agent": "Budget",
        "monthly_income": store.profile()["monthly_income"],
        "monthly_expenses": fe.monthly_expenses(),
        "disposable_income": disp,
        "spend_by_category": cats,
        "emergency_fund": ef,
        "overspend_flags": overspend,
        "summary": (
            f"Disposable income is {fmt_inr(disp)}/month. Emergency fund covers "
            f"{ef['months_covered_display']} months ({'adequate' if ef['adequate'] else 'thin'})."
            + (f" Restaurant spend is high at {fmt_inr(overspend['restaurants'])}." if overspend else "")
        ),
    }


def check_upcoming_bills() -> dict:
    bills = store.bills()
    total = sum(b["amount"] for b in bills)
    enriched = [{**b, "days_until": fe.days_until(b["due_date"])} for b in bills]
    return {
        "agent": "Bills",
        "upcoming_bills": enriched,
        "total_upcoming": total,
        "summary": f"{fmt_inr(total)} in bills due over the next cycle across {len(bills)} items.",
    }


def evaluate_loan(principal: float, annual_rate_pct: float = 11.0, months: int = 12) -> dict:
    emi_raw = fe.emi_for(principal, annual_rate_pct, months)     # full precision
    new_emi = round(emi_raw)                                     # rounded only for display
    existing = fe.existing_emi()
    total_emi = new_emi + existing
    income = store.profile()["monthly_income"]
    ratio_pct = (total_emi / income * 100) if income > 0 else None
    within = ratio_pct is not None and ratio_pct <= fe.EMI_RATIO_MAX * 100
    return {
        "agent": "Loan",
        "principal": principal,
        "annual_rate_pct": annual_rate_pct,
        "months": months,
        "new_emi": new_emi,
        "new_emi_raw": emi_raw,
        "existing_emi": existing,
        "total_emi": total_emi,
        "emi_to_income_ratio_pct": ratio_pct,                    # full precision
        "emi_to_income_ratio_display": fmt_pct(ratio_pct),
        "within_safe_limit": within,
        "calculation": {"formula": "(new_emi + existing_emi) / monthly_income * 100",
                        "inputs": {"new_emi": new_emi, "existing_emi": existing, "monthly_income": income}},
        "summary": (
            f"A {fmt_inr(principal)} loan at {annual_rate_pct}% over {months}m is {fmt_inr(new_emi)}/mo. "
            f"Total EMI-to-income becomes {fmt_pct(ratio_pct)} "
            f"({'within' if within else 'ABOVE'} the {int(fe.EMI_RATIO_MAX*100)}% safe limit)."
        ),
    }


def check_fraud_risk(target: str) -> dict:
    r = fe.url_risk(target)
    return {
        "agent": "Fraud",
        **r,
        "summary": f"'{target}' -> risk {r['risk']} (score {r['score']}). " + r["reasons"][0],
    }


def check_affordability(amount: float) -> dict:
    a = fe.affordability(amount)
    return {
        "agent": "Budget/Affordability",
        **a,
        "summary": (
            f"{fmt_inr(amount)} is {a['savings_percentage_display']} of savings "
            f"({fmt_inr(a['savings_before'])}); verdict: {a['verdict'].replace('_', ' ')}."
        ),
    }


def review_investments() -> dict:
    s = fe.investment_status()
    return {
        "agent": "Investment",
        **s,
        "summary": (
            f"{fmt_inr(s['total_invested'])} invested ({fmt_inr(s['liquid_value'])} liquid), "
            f"SIP {fmt_inr(s['monthly_sip'])}/mo. Market {s['market_trend']}; "
            f"liquidation {'advised' if s['liquidation_advised'] else 'not advised'}."
        ),
    }


def tax_check(purchase_amount: float = 0, via_business: bool = False) -> dict:
    t = fe.tax_snapshot(purchase_amount, via_business)
    return {"agent": "Tax", **t, "summary": t["note"]}


# --- registry + Gemma tool schemas ------------------------------------------

AGENT_REGISTRY = {
    "analyze_budget": analyze_budget,
    "check_upcoming_bills": check_upcoming_bills,
    "evaluate_loan": evaluate_loan,
    "check_fraud_risk": check_fraud_risk,
    "check_affordability": check_affordability,
    "review_investments": review_investments,
    "tax_check": tax_check,
}


def _tool(name, desc, props, required):
    return {"type": "function", "function": {
        "name": name, "description": desc,
        "parameters": {"type": "object", "properties": props, "required": required}}}


AGENT_TOOLS = [
    _tool("analyze_budget",
          "Assess income, expenses, disposable income, emergency fund and overspending.",
          {"purchase_amount": {"type": "number", "description": "Optional purchase under consideration."}}, []),
    _tool("check_upcoming_bills",
          "List upcoming bills and total liabilities due in the next cycle.", {}, []),
    _tool("evaluate_loan",
          "Compute EMI for a loan and check the EMI-to-income ratio against the safe limit.",
          {"principal": {"type": "number", "description": "Loan amount in INR."},
           "annual_rate_pct": {"type": "number", "description": "Annual interest rate, default 11."},
           "months": {"type": "number", "description": "Tenure in months, default 12."}}, ["principal"]),
    _tool("check_fraud_risk",
          "Assess a merchant name, website/domain, or UPI handle for fraud risk.",
          {"target": {"type": "string", "description": "Merchant, URL, or UPI id to vet."}}, ["target"]),
    _tool("check_affordability",
          "Check whether a purchase can be paid outright from savings without financing.",
          {"amount": {"type": "number", "description": "Purchase amount in INR."}}, ["amount"]),
    _tool("review_investments",
          "Review holdings, liquidity, SIP, and whether liquidating is advisable now.", {}, []),
    _tool("tax_check",
          "Identify GST component and any input-credit / tax optimisation on a purchase.",
          {"purchase_amount": {"type": "number", "description": "Purchase amount in INR."},
           "via_business": {"type": "boolean", "description": "Billed to a registered business?"}}, []),
]


def run_agent(name: str, arguments: dict) -> dict:
    fn = AGENT_REGISTRY.get(name)
    if fn is None:
        return {"agent": name, "error": f"unknown agent '{name}'", "summary": "no such agent"}
    try:
        return fn(**arguments)
    except TypeError as e:
        return {"agent": name, "error": str(e), "summary": f"bad arguments for {name}"}
