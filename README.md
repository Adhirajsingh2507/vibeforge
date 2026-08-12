# Finora

An AI **personal CFO**: a FastAPI multi-agent orchestrator over a financial
dataset, fronted by a minimal black-and-white SPA. Ask a money question and
watch specialist agents (budget, loans, fraud, bills, investments, tax) reason
about it, get judged, and produce an explainable recommendation.

**Live:** https://vibeforge-cyan.vercel.app

```
finora/
├── backend/            # FastAPI + multi-agent orchestrator
│   ├── api.py          # HTTP layer — all endpoints live here
│   ├── service.py      # loads the model once, shared across requests
│   ├── orchestrator.py # runs the agents, produces the advice trace
│   ├── agents.py       # the specialist tools (budget, loans, fraud, bills…)
│   ├── finance_engine.py  # deterministic math (no LLM)
│   ├── financial_store.py # in-memory mutable state (profile/txns/bills/…)
│   ├── judge.py        # reflection: validates findings against guardrails
│   ├── schemas.py      # pydantic request models = input validation rules
│   └── requirements.txt
├── web/                # the SPA (vanilla JS, no build step)
│   ├── index.html
│   ├── app.js          # dashboard, CRUD, chat, AI-orb WebGL viz
│   ├── tetris.js       # "The Forge" — 3D Tetris block graph (three.js)
│   ├── agents.js       # "Agent Theatre" — live reasoning-flow map
│   └── styles.css
├── api/index.py        # Vercel entry — serves backend + web on one origin
├── API_CONTRACT.md     # every endpoint, request body, response shape
└── README.md
```

## The frontend

Six views, all monochrome glass / Helvetica, PC + mobile:

- **Budget** — net worth, income/expenses/disposable, transaction ledger (CRUD).
- **Investments** — holdings, SIP, liquidity (CRUD).
- **Bills** — upcoming bills for the cycle (CRUD).
- **AI Orchestrator** — chat; ask anything, see the answer + agent trace, with a
  state-reactive WebGL particle orb.
- **The Forge** — every monetary item as a 3D Tetris tower of solid unit blocks
  (sub-unit remainders shown as a scaled micro-block); edits animate blocks
  dropping in / lifting out. WebGL/three.js, orbit + pinch, hover for detail.
- **Agent Theatre** — a live map of the multi-agent flow: the real `/advise`
  trace staged step-by-step across an orchestrator → specialists → judge →
  synthesis constellation.

## Run the backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# No GPU? Use the demo backend — the full API works with a CPU stub that
# keyword-routes to the real agents. Great for frontend dev.
GEMMA_BACKEND=demo uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

Then open http://localhost:8000/health — you should get `{"status":"ok",...}`.

`GEMMA_BACKEND` values: `demo` (CPU stub, recommended for frontend work),
`auto` (Gemma on GPU if present, else silent echo), `transformers` (force GPU).

## Frontend

The SPA in `web/` needs no build step. In production Vercel serves it and the
API on one origin. For local dev, point it at any running backend via the URL:
`http://localhost:8000/?api=http://localhost:8000` (the `?api=` override is
persisted). Or serve `web/` statically and pass `?api=` to a remote backend —
CORS is wide open (`*`).

Data flow: `GET /dashboard` (the whole financial picture) and `POST /advise`
(a question → `answer` + agent `trace`). See **API_CONTRACT.md** for the rest.

## Deploy (Vercel + CI/CD)

The whole app — FastAPI backend **and** the `web/` SPA — deploys as one Vercel
Python function (`api/index.py`, routed by `vercel.json`). Frontend and API share
one origin, so no CORS and no separate URL. The LLM is a hosted **OpenAI-compatible**
API (NVIDIA NIM or Groq), so there's no GPU: set one key and it runs anywhere.

**LLM provider** (auto-detected by which key is present; Groq preferred):
- **Groq** (default): set `GROQ_API_KEY`. Default model `llama-3.3-70b-versatile` —
  benchmarked ~0.8s with 70B-quality synthesis; the best fit for this project.
- **NVIDIA NIM** (fallback): set `NVIDIA_API_KEY`. Default model `meta/llama-3.1-8b-instruct`
  — NIM's free-tier 70B is queued/too slow for serverless; the 8B is fast but hedgier.
- Override the model with `LLM_MODEL`; force a provider with `GEMMA_BACKEND=groq|nim`.

**One-time setup**

1. Create the Vercel project (first deploy): `vercel --prod` from the repo root,
   or link an existing one with `vercel link`. This writes `.vercel/project.json`.
2. In the Vercel project env, add **`GROQ_API_KEY`** (or `NVIDIA_API_KEY`) for
   Production and Preview. Optionally set `LLM_MODEL` to override the default.
3. Add three GitHub repo secrets so CI can deploy: `VERCEL_TOKEN`,
   `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (the last two are in `.vercel/project.json`).

**Pipeline** (`.github/workflows/ci-cd.yml`)

- Every push/PR → runs `selftest.py`, `pytest`, and a JS syntax check.
- Pull request → **preview** deploy to Vercel.
- Push/merge to `master` → **production** deploy (only if tests pass).

State on Vercel is ephemeral (in-memory + `/tmp`): reads and a single chat session
work; edits reset on cold start. Fine for the demo — wire an external store
(Upstash/Vercel KV) if you need durable CRUD.

## What's the "backend" actually doing

`POST /advise` → orchestrator asks the LLM which specialist agents to run →
agents return **deterministic** results (all money math is real Python, not the
model) → an optional rule-based Judge sanity-checks → you get back an `answer`
plus a `trace` of which agents ran and what they found. The model's raw
chain-of-thought is stripped before it leaves the server.
