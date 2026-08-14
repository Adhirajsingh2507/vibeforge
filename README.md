<div align="center">

# Finora

### Your money, finally with a brain.

An AI **personal CFO** — a multi-agent system that *reasons* about your finances
and **shows its work**. Ask a money question and watch specialist agents plan,
compute, get judged, and return an explainable recommendation — with **real,
deterministic math**, never hallucinated numbers.

**▶ Live demo:** https://vibeforge-cyan.vercel.app

`FastAPI` · `Multi-agent orchestrator` · `Groq LLM` · `three.js` · `Vercel serverless` · `CI/CD`

</div>

---

## Why it's different

Most finance apps show you charts and leave the thinking to you. A naive "AI
finance app" pipes your data into one LLM prompt and hopes the arithmetic is
right. **Finora does neither.**

| | Typical LLM app | **Finora** |
|---|---|---|
| **Who does the math** | The model (can hallucinate) | **Deterministic Python** — the model only *chooses tools* and *phrases* the answer |
| **Trust** | "Looks confident" | A rule-based **Judge** validates every recommendation against hard financial guardrails |
| **Explainability** | A black box | A live **execution trace** of which agents ran and what they found |
| **Cost control** | One big prompt every time | An **intent router** — simple lookups skip the model entirely |
| **Server state** | Sticky sessions / a database | **Stateless** — conversation memory rides in a signed token, so it survives serverless cold-starts with zero infra |

The result: an assistant that can say *"technically affordable, but **wait** —
it breaks your emergency-fund floor,"* and prove why.

---

## Features

Seven surfaces, one minimal black-and-white system (Helvetica, glassmorphism),
fully responsive:

| # | View | What it does |
|---|------|--------------|
| 01 | **Budget** | Net worth, income/expenses/disposable, savings rate, transaction ledger (full CRUD) |
| 02 | **Investments** | Holdings, SIP, liquidity (CRUD) |
| 03 | **Bills** | Upcoming bills for the cycle (CRUD) |
| 04 | **AI Orchestrator** | Chat with the multi-agent CFO; answer + agent trace, with a state-reactive WebGL particle orb |
| 05 | **The Forge** | Every rupee as a **3D Tetris tower** of solid unit blocks (sub-unit remainders shown as a scaled micro-block); edits animate blocks dropping in / lifting out. Orbit, pinch, hover for exact figures |
| 06 | **Agent Theatre** | A live **reasoning map** — the *real* `/advise` trace staged step-by-step across an orchestrator → specialists → judge → synthesis grid, with interconnect wires |
| 07 | **Scan** | Upload a bill or bank statement (PDF) → extract transactions & bills → review → **import** into your dashboard |

Plus a **3D "arc-reactor" hero** on the home screen (three.js), and **follow-up
questions** ("why?", "what if it were ₹50k?") that resolve against the real prior
findings.

---

## How it works

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
        │    over finance_engine    │   ← ALL MONEY MATH HERE. No LLM arithmetic.
        └───────────────────────────┘
                                      ▼
                         ┌──────────────────────────┐
                         │  ANSWER + TRACE (JSON)    │ ──► drives the Agent Theatre UI
                         └──────────────────────────┘
```

**A query in five steps:**
1. **Router** classifies the question — a plain lookup ("my CIBIL score?") skips the model entirely (0 LLM calls).
2. **Orchestrator** plans: the LLM chooses which specialist agents to call.
3. **Agents** run as deterministic Python and return findings with real numbers.
4. **Judge** validates those findings against financial guardrails (fraud, EMI limits, emergency-fund floor) on two axes — *is the answer well-founded* and *is the action actually safe*. Never the model's job.
5. **Synthesis**: the LLM phrases the recommendation from the findings; the full **trace** is returned (raw chain-of-thought is stripped before it leaves the server).

A normal decision = **2 LLM calls**, ~1–2s end to end.

---

## Tech stack

- **Backend** — FastAPI, Python 3.13, pydantic validation. Core engine (router, agents, judge, finance math) is **stdlib-only**.
- **LLM** — hosted, **OpenAI-compatible** and **provider-agnostic** (Groq default `llama-3.3-70b-versatile`; NVIDIA NIM fallback). No GPU required. Swap providers with env vars only.
- **Frontend** — vanilla JS, **no build step**, three.js for the 3D views. One minimal design system.
- **Infra** — one Vercel Python function serves the API **and** the SPA on a single origin (no CORS, no separate URL). Stateless (signed-token conversation memory). GitHub Actions CI/CD.

---

## Quickstart

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# No API key? The demo backend keyword-routes to the REAL agents on CPU —
# the whole UI works, great for local dev.
GEMMA_BACKEND=demo uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

Open **http://localhost:8000** for the full app, or hit
**http://localhost:8000/health** to confirm the API is up.

To run against the real LLM instead, set `GROQ_API_KEY` and drop the
`GEMMA_BACKEND=demo` (get a free key at [console.groq.com](https://console.groq.com)).

**Try these** (all verified correct in production):
- `Can I afford a ₹90,000 iPhone next month?` → affordable, but the Judge says *wait*
- `Is paytm-kyc-verify.xyz safe to pay?` → fraud agent flags it
- `What is my CIBIL score?` → instant, zero LLM calls
- `Should I take a ₹3 lakh loan for 24 months?` → EMI ₹13,982/mo, within the 40% limit

---

## Deploy (Vercel + CI/CD)

The whole app deploys as one Vercel Python function (`api/index.py`, routed by
`vercel.json`).

**Environment variables**
- `GROQ_API_KEY` (or `NVIDIA_API_KEY`) — the LLM provider key.
- `LLM_MODEL` *(optional)* — override the default model.
- `SESSION_SECRET` *(recommended)* — HMAC key for the conversation token.
- `GEMMA_BACKEND` — `groq` \| `nim` \| `demo` \| `auto`.
- Image scanning *(optional)* — Groq has no vision model, so set
  `LLM_VISION_BASE_URL`, `LLM_VISION_API_KEY`, `LLM_VISION_MODEL` (e.g. Google
  Gemini) to enable photo/scan OCR. Text PDFs work without it.

**Pipeline** (`.github/workflows/ci-cd.yml`)
- Every push/PR → `selftest.py` + `pytest` + a JS syntax check.
- PR → **preview** deploy · push to `master` → **production** deploy (only if tests pass).

---

## Project structure

```
finora/
├── backend/              # FastAPI + multi-agent orchestrator
│   ├── api.py            # HTTP layer — every endpoint
│   ├── service.py        # shared orchestrator + stateless advise()
│   ├── orchestrator.py   # router → plan → agents → judge → synthesis
│   ├── agents.py         # the 7 specialist tools
│   ├── finance_engine.py # deterministic money math (no LLM)
│   ├── judge.py          # reflection: rule-based guardrails
│   ├── router.py         # intent classification (fast-path vs full)
│   ├── session_token.py  # signed, stateless conversation memory (HS256)
│   ├── scan.py           # document → importable transactions/bills
│   ├── financial_store.py, schemas.py, conversation.py, formatting.py
│   └── requirements.txt
├── web/                  # the SPA (vanilla JS, no build step)
│   ├── index.html
│   ├── app.js            # dashboard, CRUD, chat, scan, orb
│   ├── tetris.js         # "The Forge" 3D block graph
│   ├── agents.js         # "Agent Theatre" reasoning grid
│   ├── hero3d.js         # 3D arc-reactor hero
│   └── styles.css
├── api/index.py          # Vercel entry — serves backend + web
├── API_CONTRACT.md       # every endpoint, request/response shape
├── DEMO_SCRIPT.md        # the demo-video walkthrough
└── README.md
```

---

## Design decisions & honest limits

- **Deterministic-first.** The LLM is deliberately kept away from arithmetic and from pass/fail judgments — that's what makes the numbers trustworthy.
- **Stateless by design.** Conversation memory is a signed token the client replays, so follow-ups survive serverless cold-starts with no database. (Trade-off analysis of alternatives — client-token vs KV vs sticky sessions — informed this choice.)
- **Ephemeral financial store.** On Vercel, edits live in memory + `/tmp` and reset on cold start — perfect for a demo. Wire an external store (Upstash/Neon) for durable, multi-user CRUD.
- **Image scanning is opt-in.** Text PDFs work out of the box; photos need a vision provider key (see Deploy).

---

<div align="center">

Built for the hackathon. Deterministic where it counts, intelligent where it matters.

</div>
