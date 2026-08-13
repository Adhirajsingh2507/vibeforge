# Finora — Hackathon Demo Video Script (Detailed)

**Runtime:** ~4:00 · **Format:** screen recording + voiceover · **Live:** https://vibeforge-cyan.vercel.app
**Tone:** calm, confident, technical-but-clear. Slow down on the two hero moments (Agent Theatre + The Forge). ~150 wpm.

> This version covers the **architecture**, **how a request flows**, and **every feature**. A 90-second cutdown is at the bottom.

---

## 0 · One-line positioning (say it in the first 10s)
> "Finora is an AI personal CFO — a team of specialist agents that *reason* about your money, with deterministic math so the numbers are never made up."

---

## 1 · The full script (scene by scene)

| Time | On screen | Voiceover |
|------|-----------|-----------|
| **0:00–0:14** · Hook | Slow push-in on the home screen — the 6 illustrated cards, dark glass, Helvetica. | "Every day you make money decisions. Can I afford this. Is this loan safe. Is this link a scam. Most finance apps just show you charts and leave the thinking to you. **Finora** does the thinking — and shows its work." |
| **0:14–0:32** · What it is | Cursor glides across the 6 cards, naming each. | "It's an AI personal CFO. Under one minimal interface there are six surfaces — your budget, investments, bills, an AI advisor, a 3D view of your money, and a live map of the agents reasoning. But the real story is what happens underneath." |
| **0:32–0:52** · Architecture 1 — the team | Cut to a simple architecture slide (see ASCII diagram below) OR the Agent Theatre grid sitting idle. | "Finora isn't one prompt. It's a **multi-agent system**. An orchestrator receives your question, a router decides how much firepower it needs, and it calls specialist agents — budget, affordability, loan, bills, investment, tax, and fraud. Then a **judge** validates the result before you ever see it." |
| **0:52–1:16** · Architecture 2 — why it's trustworthy | Keep the diagram; highlight the "deterministic math" and "judge" boxes. | "Here's the key design choice. The language model never does arithmetic. Every agent is a **deterministic Python function** — the model only decides *which* agents to call and how to phrase the answer. So the numbers are computed, not hallucinated. And the judge is rule-based: it checks the findings against hard financial guardrails — fraud, EMI limits, emergency-fund floor — on two axes: *is the answer well-founded*, and *is the action actually safe*." |
| **1:16–2:02** · HERO 1 — Agent Theatre (live) | Open **Agent Theatre**. Type: *"Can I afford a ₹90,000 iPhone next month?"* Let the flow play: orchestrator cell activates, wires thread to the affordability agent, then the judge, then the recommendation. Point the cursor along the wire as you narrate. | "Let's watch it live. I ask if I can afford a ninety-thousand-rupee iPhone. The orchestrator routes it, and calls the affordability specialist — you can follow the connection light up. It computes that this is fifty percent of my savings. Technically affordable. But watch the judge: paying outright would break my three-month emergency-fund cushion — so the verdict comes back **caution**, and Finora tells me to *wait*, not just yes. That guardrail is the difference between a chatbot and an advisor. And everything you just saw is the *real* execution trace — not an animation." |
| **2:02–2:20** · Router / speed | Home → AI chat. Type: *"What is my CIBIL score?"* — answers instantly. | "Not every question needs the full pipeline. A simple lookup like my credit score is answered instantly and deterministically — zero model calls — because the router recognizes it. Cheap questions stay cheap; hard ones get the full multi-agent treatment." |
| **2:20–2:38** · Fraud | Type: *"Is paytm-kyc-verify.xyz safe to pay?"* Show the fraud verdict + agent trace chips. | "Different job, same system. The fraud agent flags the low-reputation domain and the lookalike pattern and tells me to stay away. Affordability, loans, fraud, tax — one reasoning engine, many specialists." |
| **2:38–2:56** · AI chat surface | Show the chat view: the reactive WebGL orb changing state (thinking → generating), the typewriter answer, the "agents consulted" trace chips. | "The chat itself is alive — this WebGL orb reacts to the system's state as it thinks, generates, and responds, and every answer shows exactly which agents were consulted." |
| **2:56–3:20** · Dashboard + full CRUD | Open **Net worth**: net worth, income, expenses, disposable, savings rate. Add a transaction in the modal → it appears. Open **Investments**, then **Bills** — show add/edit. | "It's also a real product, not just a demo. A full financial dashboard — net worth, cashflow, savings rate — with complete create-read-update-delete on your transactions, investments, and bills. Everything you edit flows straight back into the agents' reasoning." |
| **3:20–3:52** · HERO 2 — The Forge | Open **The Forge**. Slowly orbit the 3D scene. Hover a tower → tooltip with exact value + block breakdown. Then add or edit an amount → blocks drop in / lift out. | "And this is your money in three dimensions. **The Forge** turns every rupee — every asset, bill, and category — into a Tetris tower of solid blocks. One block is a fixed amount; the bright cap block carries the remainder, so mid-values read exactly, not rounded. Hover anything for the precise figure. And when your finances change, the blocks physically drop in or lift out. It's a financial state you can *feel*." |
| **3:52–4:02** · Responsive + stack | Quick cuts: a phone-width view of the same screens; then one beat on a terminal/repo or the architecture slide. | "It's fully responsive on mobile, built on a FastAPI multi-agent backend with a provider-agnostic LLM, deployed serverless with automated CI/CD." |
| **4:02–4:12** · Close | Return to the home screen, hold. Live URL on screen. | "Deterministic where it counts. Intelligent where it matters. **Finora** — your money, finally with a brain. It's live right now." |

---

## 2 · Architecture slide (recreate as one clean graphic, or narrate over it)

```
                         ┌──────────────────────────┐
   "Can I afford…?" ───► │   INTENT ROUTER          │  fast-path vs full pipeline
                         └────────────┬─────────────┘
                                      ▼
                         ┌──────────────────────────┐
                         │   ORCHESTRATOR (CFO)      │  Plan → Act → Reflect
                         │   picks tools, phrases     │  (LLM: selection + wording only)
                         └───┬───────────────────┬───┘
             tool calls      ▼                   ▼
        ┌───────────────────────────┐   ┌──────────────────┐
        │  SPECIALIST AGENTS (7)    │   │   JUDGE           │  rule-based guardrails
        │  budget · affordability   │   │  response_ok?     │  (two-axis, ≤2 revisions)
        │  loan · bills · invest    │──►│  transaction_safe?│
        │  tax · fraud              │   └──────────────────┘
        │  = deterministic Python   │
        │    over finance_engine    │   ← ALL MATH HERE. No LLM arithmetic.
        └───────────────────────────┘
                                      ▼
                         ┌──────────────────────────┐
                         │  ANSWER + TRACE (JSON)    │ ──► drives the Agent Theatre UI
                         └──────────────────────────┘

Serving:  one FastAPI function serves BOTH the API and the web SPA (one origin, no CORS).
LLM:      OpenAI-compatible + provider-agnostic (Groq default; swap via env). No GPU needed.
Ship:     GitHub Actions → tests (selftest + pytest + JS check) → Vercel preview / prod.
```

## 3 · "How a query flows" — 5 steps to say aloud if you show the diagram
1. **Router** classifies the question — a plain lookup skips the model entirely.
2. **Orchestrator** plans: the LLM chooses which specialist agents to call.
3. **Agents** run as deterministic Python and return findings with real numbers.
4. **Judge** validates those findings against financial guardrails (never the model's job).
5. **Synthesis**: the LLM phrases the recommendation from the findings — and the whole **trace** is returned, which is exactly what the Agent Theatre animates.

---

## 4 · Before you record (checklist)
- **Warm up the backend**: load the site and run one query first so the serverless function is hot (no cold-start pause on camera).
- Verified queries to use (all correct in production):
  - `Can I afford a ₹90,000 iPhone next month?` (hero — judge says caution)
  - `What is my CIBIL score?` (instant fast-path)
  - `Is paytm-kyc-verify.xyz safe to pay?` (fraud)
- Record **1080p/1440p at 60fps** — the 3D and the wire animations need it.
- The Forge: **orbit slowly**; one smooth drag beats fast spinning.
- Do a silent capture pass first, then voiceover while watching it back.
- Clean browser window (incognito, no bookmarks bar).

## 5 · 90-second cutdown (if a shorter version is required)
Keep: **Hook (0:00–0:14)** → **Architecture 1+2 condensed to ~20s** → **Agent Theatre hero** → **The Forge** → **Close**.
Drop: CIBIL fast-path, fraud, chat-orb, and the CRUD montage.
