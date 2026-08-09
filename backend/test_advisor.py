"""Regression suite for routing, multi-turn, numeric precision, provenance,
data-change, and generation-count/latency instrumentation.

Run: GEMMA_BACKEND=demo python test_advisor.py
Uses the CPU `demo` backend so it runs with no GPU. Real wall-clock latency must
be measured on Kaggle (see notebook Section 9); here we assert the *number of
Gemma generations per intent*, which is the driver of latency.
"""

import os
os.environ.setdefault("GEMMA_BACKEND", "demo")
os.environ["CFO_DATA_FILE"] = "/tmp/cfo_test_data.json"

import financial_store as store
import router
import service
from formatting import fmt_inr, fmt_pct, pct


def section(t): print(f"\n=== {t} ===")


def test_numeric():
    section("NUMERICAL precision (the ₹50 bug)")
    assert pct(50, 180000)["display"] == "0.03%", pct(50, 180000)["display"]
    assert pct(90000, 180000)["display"] == "50.0%"
    assert pct(1, 180000)["display"] not in ("0%", "0.0%", "0.00%")
    assert fmt_inr(180000) == "₹1,80,000" and fmt_inr(485000) == "₹4,85,000"
    print("50/180000 ->", pct(50, 180000)["display"],
          "| 1/180000 ->", pct(1, 180000)["display"], "| ₹1,80,000 OK")


def test_routing():
    section("ROUTING classification")
    cases = [
        ("What is my CIBIL score?", False, router.FAST_DATA),
        ("How much have I invested?", False, router.FAST_DATA),
        ("Can I afford a ₹90,000 iPhone?", False, router.DECISION),
        ("Why not?", True, router.FOLLOWUP_EXPLAIN),
        ("That percentage seems wrong.", True, router.FOLLOWUP_EXPLAIN),
        ("What if it cost ₹50,000?", True, router.FOLLOWUP_WHATIF),
        ("Is it safe to pay on apple-sale-90off.xyz?", False, router.FRAUD),
    ]
    for q, hist, expect in cases:
        got = router.classify(q, hist)["intent"]
        print(f"  {got:18s} <- {q!r}")
        assert got == expect, f"{q!r}: expected {expect}, got {got}"


def test_multiturn_and_costs():
    section("MULTI-TURN conversation + generation counts")
    store.reset()
    sid = service.new_session()["session_id"]
    turns = [
        ("Can I afford a ₹90,000 iPhone?", router.DECISION, 2),
        ("Why not?", router.FOLLOWUP_EXPLAIN, 1),
        ("What if it cost ₹50,000?", router.FOLLOWUP_WHATIF, 2),
        ("What EMI would that be for 12 months?", router.FOLLOWUP_WHATIF, 2),
    ]
    for q, intent, max_calls in turns:
        r = service.advise(q, session_id=sid)
        print(f"  [{r['intent']:16s}] gemma_calls={r['gemma_calls']} :: {q}")
        assert r["intent"] == intent, f"{q}: {r['intent']} != {intent}"
        assert r["gemma_calls"] <= max_calls, f"{q}: {r['gemma_calls']} > {max_calls}"
        assert "reasoning" not in str(r["trace"]), "raw reasoning leaked!"


def test_fast_path_zero_gemma():
    section("FAST_DATA = 0 Gemma generations")
    store.reset()
    for q in ("What is my CIBIL score?", "How much have I invested?", "What is my monthly income?"):
        r = service.advise(q)
        print(f"  gemma_calls={r['gemma_calls']} :: {q} -> {r['answer']}")
        assert r["gemma_calls"] == 0, f"{q} used {r['gemma_calls']} generations"


def test_provenance():
    section("PROVENANCE / correction ('show me the calculation')")
    import finance_engine as fe
    store.reset()
    a = fe.affordability(50)
    print("  affordability(50):", a["savings_percentage_display"], a["calculation"])
    assert a["savings_percentage_display"] == "0.03%"
    assert a["calculation"]["inputs"] == {"numerator": 50, "denominator": 180000}


def test_data_change():
    section("DATA CHANGE propagates to a re-asked question")
    import finance_engine as fe
    store.reset()
    before = fe.affordability(90000)["verdict"]
    sid = service.new_session()["session_id"]
    service.advise("Can I afford a ₹90,000 iPhone?", session_id=sid)
    store.patch_profile({"savings_balance": 500000, "emergency_fund": 250000})
    after = fe.affordability(90000)["verdict"]
    r = service.advise("Can I afford the ₹90,000 iPhone now?", session_id=sid)
    print(f"  verdict before={before} after={after}")
    print("  re-asked summary:", r["trace"][1].get("summary") if len(r["trace"]) > 1 else r["answer"])
    assert before == "affordable_but_depletes_buffer" and after == "affordable_outright"
    # dashboard cache must reflect the edit
    assert service.dashboard()["profile"]["savings_balance"] == 500000


def test_latency_report():
    section("LATENCY instrumentation (demo backend; wall-clock ~0, counts real)")
    store.reset()
    for q in ["What is my CIBIL score?", "Can I afford a ₹90,000 iPhone?",
              "Is it safe to pay on apple-sale-90off.xyz?"]:
        r = service.advise(q)
        print(f"  {r['intent']:12s} gens={r['gemma_calls']} timings={r['timings']}")
    print("  (Real Kaggle wall-clock: run notebook Section 9.)")


if __name__ == "__main__":
    test_numeric()
    test_routing()
    test_multiturn_and_costs()
    test_fast_path_zero_gemma()
    test_provenance()
    test_data_change()
    test_latency_report()
    print("\nALL ADVISOR TESTS PASSED")
