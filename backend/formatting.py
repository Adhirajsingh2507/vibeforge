"""Centralized numeric formatting + calculation provenance.

Single source of truth so no percentage is ever formatted ad-hoc in an agent.
Fixes the class of bug where ₹50 / ₹1,80,000 rendered as "0.0%": adaptive
precision guarantees a non-zero ratio never displays as 0%.

Rules (percentage value p, already in percent units, e.g. 0.0278 means 0.0278%):
    p == 0            -> "0%"
    |p| >= 1          -> 1 decimal        (50.0%)
    |p| >= 0.01       -> 2 decimals       (0.03%)
    0 < |p| < 0.01    -> enough decimals to keep the first significant digit
Currency uses Indian digit grouping (₹1,80,000).
"""

from __future__ import annotations

import math
import re


def fmt_pct(p: float | None, *, force_decimals: int | None = None) -> str:
    if p is None:
        return "—"
    if p == 0:
        return "0%"
    ap = abs(p)
    if force_decimals is not None:
        d = force_decimals
    elif ap >= 1:
        d = 1
    elif ap >= 0.01:
        d = 2
    else:
        # first significant digit is at 10^floor(log10(ap)); show one more place
        d = -int(math.floor(math.log10(ap))) + 1
    return f"{p:.{d}f}%"


def pct(numerator: float, denominator: float) -> dict:
    """Percentage with full precision + adaptive display + provenance.
    Returns fraction, percentage (raw), and a display string."""
    if not denominator:
        return {"fraction": None, "percentage": None, "display": "—",
                "calculation": {"formula": "n/a", "inputs":
                                {"numerator": numerator, "denominator": denominator}}}
    frac = numerator / denominator
    perc = frac * 100.0
    return {
        "fraction": frac,
        "percentage": perc,
        "display": fmt_pct(perc),
        "calculation": {
            "formula": "numerator / denominator * 100",
            "inputs": {"numerator": numerator, "denominator": denominator},
        },
    }


def fmt_inr(n: float | None) -> str:
    """Indian-grouped rupee string, e.g. 180000 -> '₹1,80,000'.
    Shows paise only when the value isn't a whole rupee."""
    if n is None:
        return "—"
    neg = n < 0
    n = abs(float(n))
    whole = int(round(n)) if abs(n - round(n)) < 1e-9 else None
    if whole is None:                       # keep two decimals for non-integer rupees
        intp = int(n)
        paise = f"{n - intp:.2f}"[1:]       # ".xx"
    else:
        intp, paise = whole, ""
    s = str(intp)
    last3, rest = s[-3:], s[:-3]
    if rest:
        last3 = "," + last3
        rest = re.sub(r"\B(?=(\d{2})+(?!\d))", ",", rest)
    return ("-" if neg else "") + "₹" + rest + last3 + paise


def calc(formula: str, inputs: dict, result=None) -> dict:
    """A small provenance record so answers can be explained deterministically."""
    rec = {"formula": formula, "inputs": inputs}
    if result is not None:
        rec["result"] = result
    return rec
