"""Deterministic financial math.

Nothing in this module calls an LLM. Every rupee figure the system reports comes
from here, so the numbers are auditable and reproducible. Gemma 4 receives these
results as tool outputs and explains them -- it never does the arithmetic.
"""

from collections import defaultdict
from datetime import date, datetime

# Fraud intel is static (not user-editable); the rest comes from the mutable store.
import financial_store as store
from formatting import calc, fmt_inr, fmt_pct, pct
from mock_data import KNOWN_BAD, SUSPICIOUS_PATTERNS, SUSPICIOUS_TLDS, TRUSTED_MERCHANTS

TODAY = date(2026, 7, 24)

# RBI-ish rule of thumb: total EMI outflow above 40% of income is a red flag.
EMI_RATIO_SAFE = 0.36
EMI_RATIO_MAX = 0.40

# Emergency fund should cover this many months of expenses.
EMERGENCY_FUND_MONTHS = 3

# CIBIL/credit score valid range (used for validation + gauge scaling).
CIBIL_MIN = 300
CIBIL_MAX = 900


def monthly_expenses() -> int:
    return sum(t["amount"] for t in store.transactions())


def spend_by_category() -> dict:
    buckets = defaultdict(int)
    for t in store.transactions():
        buckets[t["category"]] += t["amount"]
    return dict(sorted(buckets.items(), key=lambda kv: -kv[1]))


def disposable_income() -> int:
    return store.profile()["monthly_income"] - monthly_expenses()


def existing_emi() -> int:
    return sum(t["amount"] for t in store.transactions() if t["category"] == "emi")


def emi_for(principal: float, annual_rate_pct: float, months: int) -> float:
    """Standard reducing-balance EMI."""
    if months <= 0:
        raise ValueError("months must be positive")
    r = annual_rate_pct / 1200.0
    if r == 0:
        return principal / months
    growth = (1 + r) ** months
    return principal * r * growth / (growth - 1)


def emergency_fund_status() -> dict:
    exp = monthly_expenses()
    required = exp * EMERGENCY_FUND_MONTHS
    have = store.profile()["emergency_fund"]
    months = (have / exp) if exp > 0 else None       # full precision
    return {
        "emergency_fund": have,
        "recommended_minimum": required,
        "months_covered": months,
        "months_covered_display": (f"{months:.1f}" if months is not None else "—"),
        "adequate": have >= required,
        "calculation": calc("emergency_fund / monthly_expenses",
                            {"emergency_fund": have, "monthly_expenses": exp,
                             "months_required": EMERGENCY_FUND_MONTHS}),
    }


def days_until(due: str) -> int:
    return (datetime.strptime(due, "%Y-%m-%d").date() - TODAY).days


def url_risk(target: str) -> dict:
    """Heuristic reputation check on a merchant name, domain, or UPI handle."""
    t = target.strip().lower()
    reasons, score = [], 0

    if t in KNOWN_BAD:
        return {
            "target": target,
            "risk": "CRITICAL",
            "score": 100,
            "reasons": ["Domain appears on the known-fraud blocklist."],
        }

    if any(m in t for m in TRUSTED_MERCHANTS):
        reasons.append("Matches a known, previously-transacted merchant.")
        score -= 40

    for pat in SUSPICIOUS_PATTERNS:
        if pat in t:
            reasons.append(f"Contains bait pattern {pat!r} common in phishing URLs.")
            score += 30

    for tld in SUSPICIOUS_TLDS:
        if t.endswith(tld):
            reasons.append(f"Uses low-reputation TLD {tld!r}.")
            score += 35

    if t.count("-") >= 2:
        reasons.append("Multiple hyphens -- typical of lookalike domains.")
        score += 15

    if "@" in t and not t.split("@")[-1] in {"okhdfcbank", "oksbi", "okicici", "ybl", "paytm"}:
        reasons.append("UPI handle is not a recognised bank PSP suffix.")
        score += 40

    score = max(0, min(100, score))
    risk = "LOW" if score < 25 else "MEDIUM" if score < 55 else "HIGH" if score < 80 else "CRITICAL"
    if not reasons:
        reasons.append("No known signals either way; treat as unverified.")
    return {"target": target, "risk": risk, "score": score, "reasons": reasons}


def investment_status() -> dict:
    inv = store.investments()
    total = sum(i["value"] for i in inv)
    liquid = sum(i["value"] for i in inv if i["liquid"])
    monthly_sip = sum(i["monthly_contribution"] for i in inv)
    return {
        "holdings": inv,
        "total_invested": total,
        "liquid_value": liquid,
        "monthly_sip": monthly_sip,
        # Simple "don't sell in a down market" heuristic for the demo.
        "market_trend": "down",
        "liquidation_advised": False,
    }


# Slabs are illustrative (new regime, simplified) -- deterministic, not tax advice.
def tax_snapshot(purchase_amount: float = 0, via_business: bool = False) -> dict:
    annual_income = store.profile()["monthly_income"] * 12
    gst_rate = 0.18
    gst_component = round(purchase_amount - purchase_amount / (1 + gst_rate)) if purchase_amount else 0
    return {
        "annual_income": annual_income,
        "regime": "new",
        "gst_rate_pct": 18,
        "gst_in_purchase": gst_component,
        "gst_input_credit_possible": via_business,
        "note": (
            "If billed to a registered business, the GST component may be claimable "
            "as input credit." if via_business else
            "Personal purchase: GST is not recoverable."
        ),
    }


def cibil_band(score: int) -> str:
    return ("Excellent" if score >= 750 else "Good" if score >= 700
            else "Fair" if score >= 650 else "Poor")


def affordability(amount: float) -> dict:
    """Can this purchase be absorbed outright, without financing?
    All ratios carry full precision + an adaptive display + provenance."""
    disp = disposable_income()
    savings = store.profile()["savings_balance"]
    savings_after = savings - amount
    ef = emergency_fund_status()
    p = pct(amount, savings)                         # {fraction, percentage, display, calculation}
    months_disp = (amount / disp) if disp > 0 else None
    return {
        "purchase_amount": amount,
        "monthly_disposable_income": disp,
        "months_of_disposable_income": months_disp,
        "months_of_disposable_income_display": (f"{months_disp:.1f}" if months_disp is not None else "—"),
        "savings_before": savings,
        "savings_after": savings_after,
        # full-precision fraction + percentage, plus the display string (fixes the ₹50 bug)
        "savings_fraction": p["fraction"],
        "savings_percentage": p["percentage"],
        "savings_percentage_display": p["display"],
        "calculation": p["calculation"],
        "emergency_fund_intact": savings_after >= ef["recommended_minimum"],
        "verdict": (
            "affordable_outright" if savings_after >= ef["recommended_minimum"]
            else "affordable_but_depletes_buffer" if savings_after > 0
            else "not_affordable_outright"
        ),
    }
