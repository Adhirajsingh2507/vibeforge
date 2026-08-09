"""CPU self-test: proves agents + judge + orchestrator wiring without a GPU.

Uses a scripted EchoBackend that emits the exact Gemma 4 tool-call wire format,
so we exercise the real parser and the real loop. Run: python selftest.py
"""

import json

from llm import EchoBackend, GenResult, parse_tool_calls
from orchestrator import Orchestrator, dashboard_snapshot


def script(messages, tools):
    """Simulate Gemma 4 for the query 'Can I buy an iPhone for 90000?'."""
    last = messages[-1]["content"]
    if isinstance(last, list):
        last = " ".join(p.get("text", "") for p in last if isinstance(p, dict))

    # Synthesis turn (no tools passed) -> return prose.
    if tools is None:
        return GenResult(text="You can afford the iPhone via a 12-month EMI. Your EMI-to-"
                              "income ratio stays healthy, the emergency fund is intact, and "
                              "no fraud was detected. Recommendation: buy on 12-month EMI.")

    # First planning turn -> emit tool calls in Gemma's wire format.
    raw = ('I will consult the specialists. '
           '<|tool_call>call:check_affordability{amount:"90000"}<tool_call|>'
           '<|tool_call>call:evaluate_loan{principal:"90000",annual_rate_pct:"11",months:"12"}<tool_call|>'
           '<|tool_call>call:check_upcoming_bills{}<tool_call|>'
           '<|tool_call>call:check_fraud_risk{target:"Apple Store"}<tool_call|>')
    from llm import strip_tool_calls
    return GenResult(text=strip_tool_calls(raw), tool_calls=parse_tool_calls(raw))


def main():
    print("=== tool-call parser ===")
    calls = parse_tool_calls(
        '<|tool_call>call:evaluate_loan{principal:"90000",annual_rate_pct:"11",months:"12"}<tool_call|>')
    print(calls)
    assert calls == [{"name": "evaluate_loan",
                      "arguments": {"principal": 90000, "annual_rate_pct": 11, "months": 12}}], calls

    print("\n=== orchestrator (judge ON) ===")
    orch = Orchestrator(EchoBackend(script), use_judge=True, max_iterations=2)
    advice = orch.advise("Can I afford to buy an iPhone worth Rs.90,000 next month?")
    print("ANSWER:", advice.answer)
    print("CONFIDENCE:", advice.confidence)
    print("ITERATIONS:", advice.iterations)
    print("\nTRACE:")
    for t in advice.trace:
        print(" ", json.dumps(t)[:160])

    print("\n=== scrub + special-token arg parsing ===")
    from llm import scrub
    assert scrub("Buy it.<turn|>") == "Buy it.", scrub("Buy it.<turn|>")
    assert scrub("<|channel>thoughtreasoning here") == "", scrub("<|channel>thoughtx")
    fraud_call = parse_tool_calls(
        '<|tool_call>call:check_fraud_risk{target:<|"|>apple-sale-90off.xyz<|"|>}<tool_call|>')
    print("fraud arg parsed:", fraud_call)
    assert fraud_call[0]["arguments"]["target"] == "apple-sale-90off.xyz", fraud_call

    print("\n=== judge split semantics (fraud) ===")
    import judge
    from agents import check_fraud_risk
    fv = judge.evaluate([check_fraud_risk("apple-sale-90off.xyz")])
    print("response_ok:", fv["response_ok"], "| transaction_safe:", fv["transaction_safe"],
          "| risk:", fv["risk_level"], "| confidence:", fv["confidence"])
    assert fv["response_ok"] is True, "a correct fraud warning must be a valid response"
    assert fv["transaction_safe"] is False, "the transaction itself is unsafe"

    print("\n=== dashboard snapshot ===")
    snap = dashboard_snapshot()
    print("CIBIL:", snap["cibil"])
    print("BUDGET:", {k: snap["budget"][k] for k in ("income", "expenses", "disposable")})
    print("EMERGENCY:", snap["emergency_fund"]["months_covered"], "months")

    assert advice.findings, "no findings produced"
    assert advice.judge_verdict is not None
    print("\nALL CHECKS PASSED")


if __name__ == "__main__":
    main()
