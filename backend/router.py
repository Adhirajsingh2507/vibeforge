"""Lightweight intent router.

Not every message needs the full multi-agent pipeline. We classify each query so
simple ones stay cheap:

    FAST_DATA        -> deterministic lookup, 0 Gemma generations
    FOLLOWUP_EXPLAIN -> reuse prior findings, 1 short Gemma synthesis (no tools)
    FOLLOWUP_WHATIF  -> re-run tools with a new number, planning + synthesis
    FRAUD            -> fraud agent + Judge + 1 synthesis
    DECISION         -> planner + agents + Judge + synthesis (revision only if needed)
    COMPLEX          -> full multi-agent workflow

Rule-based and conservative: when unsure it falls back to DECISION so we never
under-serve a real financial question.
"""

from __future__ import annotations

import re

FAST_DATA = "FAST_DATA"
FOLLOWUP_EXPLAIN = "FOLLOWUP_EXPLAIN"
FOLLOWUP_WHATIF = "FOLLOWUP_WHATIF"
FRAUD = "FRAUD"
DECISION = "DECISION"
COMPLEX = "COMPLEX"

_AMOUNT_RE = re.compile(r"(?:₹|rs\.?\s*)?\s*([\d][\d,]*(?:\.\d+)?)\s*(k|lakh|l|cr|crore)?", re.I)
_URLISH = re.compile(r"[\w-]+\.(?:xyz|top|click|buzz|com|in|net|org|io|co)\b|@\w+|https?://", re.I)

# FAST_DATA: a plain lookup of a single stored quantity.
_FAST = [
    (re.compile(r"\b(cibil|credit score)\b", re.I), "cibil"),
    # disposable must precede income: "disposable income" also matches income
    (re.compile(r"\bdisposable\b", re.I), "disposable"),
    (re.compile(r"\b(monthly )?income\b", re.I), "income"),
    (re.compile(r"\b(savings|balance)\b", re.I), "savings"),
    (re.compile(r"\b(expenses?|spend(ing)?)\b", re.I), "expenses"),
    (re.compile(r"\b(bills?|due)\b", re.I), "bills"),
    (re.compile(r"\b(invest(ed|ments?)?|sip|portfolio)\b", re.I), "investments"),
    (re.compile(r"\bemergency fund\b", re.I), "emergency"),
    (re.compile(r"\bemi\b", re.I), "emi"),
]
_LOOKUP_LEAD = re.compile(r"^\s*(what('?s| is| are)|how much|how many|show|tell me|"
                          r"list|do i have|what'?s my)\b", re.I)
_DECISION_WORDS = re.compile(r"\b(afford|should i|can i (buy|afford|take)|worth it|"
                             r"recommend|take (a|this|the) loan|buy|purchase)\b", re.I)
_EXPLAIN_WORDS = re.compile(r"\b(why|how did you|how do you|explain|show me the (calc|working|math)|"
                            r"where did|prove|breakdown|wrong|incorrect|justify|reason)\b", re.I)
_WHATIF_WORDS = re.compile(r"\b(what if|what about|instead|suppose|if it (was|were|cost)|"
                           r"would (it|that|you)|for \d+ ?months?|over \d+ ?months?)\b", re.I)
_REFERENCE = re.compile(r"\b(it|that|this|then|those|the same|still)\b", re.I)


def parse_amount(text: str):
    """First monetary amount in the text, normalized to rupees (handles k/lakh/cr)."""
    for m in _AMOUNT_RE.finditer(text):
        num = m.group(1).replace(",", "")
        if not num or num == ".":
            continue
        try:
            v = float(num)
        except ValueError:
            continue
        unit = (m.group(2) or "").lower()
        if unit == "k":
            v *= 1e3
        elif unit in ("l", "lakh"):
            v *= 1e5
        elif unit in ("cr", "crore"):
            v *= 1e7
        # ignore bare small numbers that are clearly "12 months" tenor, not money
        if unit == "" and v <= 60 and re.search(rf"{re.escape(m.group(1))}\s*months?", text, re.I):
            continue
        return v
    return None


def classify(query: str, has_history: bool) -> dict:
    q = query.strip()
    ql = q.lower()
    amount = parse_amount(q)
    is_url = bool(_URLISH.search(q))

    if _URLISH.search(q) or re.search(r"\b(safe to pay|scam|fraud|legit|phishing|merchant safe)\b", ql):
        return {"intent": FRAUD, "amount": amount, "is_url": is_url}

    if has_history:
        if _EXPLAIN_WORDS.search(ql) and not _DECISION_WORDS.search(ql):
            return {"intent": FOLLOWUP_EXPLAIN, "amount": amount, "is_url": is_url}
        if _WHATIF_WORDS.search(ql) or (amount is not None and _REFERENCE.search(ql) and len(q.split()) <= 12):
            return {"intent": FOLLOWUP_WHATIF, "amount": amount, "is_url": is_url}

    if _DECISION_WORDS.search(ql) or amount is not None:
        return {"intent": DECISION, "amount": amount, "is_url": is_url}

    # FAST_DATA only for short lookup-style questions about one stored quantity
    if _LOOKUP_LEAD.search(ql) or len(q.split()) <= 6:
        for rx, key in _FAST:
            if rx.search(ql):
                return {"intent": FAST_DATA, "field": key, "amount": amount, "is_url": is_url}

    return {"intent": DECISION, "amount": amount, "is_url": is_url}
