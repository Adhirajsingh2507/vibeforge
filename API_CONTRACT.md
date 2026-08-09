# Vibeforge Backend — API Contract

Base URL (dev): `http://localhost:8000`. All bodies are JSON. CORS is open to
`*`. Validation errors return **422** with a `detail` array naming the bad
field; not-found returns **404**.

> This document is the source of truth for the frontend. It matches
> `backend/api.py` and `backend/schemas.py`. If they disagree, the code wins —
> tell the backend owner.

---

## Core

### `GET /health`
Liveness + which model backend is loaded.
```json
{ "status": "ok", "backend": "EchoBackend", "backend_kind": "demo",
  "load_mode": null, "model": null, "judge_enabled": true }
```

### `GET /dashboard`
The full financial picture, deterministic (no LLM). Render your home screen from
this. Cached until the financial data changes.
```json
{
  "profile": { "name": "...", "monthly_income": 0, "savings_balance": 0,
               "emergency_fund": 0, "credit_score": 0, "currency": "INR" },
  "cibil": { "score": 0, "band": "…", "min": 300, "max": 900 },
  "budget": { "income": 0, "expenses": 0, "disposable": 0,
              "by_category": { "…": 0 } },
  "emergency_fund": { "…": "…" },
  "bills": [ … ],
  "investments": [ … ],
  "existing_emi": 0,
  "emi_to_income_pct": 0.0
}
```

### `POST /advise`
Ask the multi-agent CFO a question. This is the main event.

Request:
```json
{ "query": "Can I afford a 90000 iPhone?", "session_id": null }
```
- `query`: 1–500 chars (required).
- `session_id`: pass one from `POST /conversation/new` for multi-turn memory, or
  `null` for a one-shot.

Response (`Advice`):
```json
{
  "answer": "…natural-language recommendation…",
  "confidence": 0.0,
  "trace": [ { "agent": "check_affordability", "summary": "…" } ],
  "findings": [ { "agent": "…", "summary": "…" } ],
  "judge_verdict": { … } | null,
  "iterations": 1,
  "session_id": null,
  "intent": "DECISION",
  "gemma_calls": 0,
  "timings": { … }
}
```
Render `answer` as the reply; render `trace`/`findings` as an "how the agents
worked" panel. Note: the model's hidden reasoning is **never** in the response by
design.

### Conversation sessions (optional, for multi-turn)
- `POST /conversation/new` → `{ "session_id": "…" }`
- `POST /conversation/{session_id}/clear` → `{ "cleared": "…" }`

---

## Financial data (CRUD)

All the state the dashboard reads. Every write returns the created/updated
record. Amounts are positive; dates are `YYYY-MM-DD`.

### Read / reset
- `GET  /financial-data` → the full raw state object.
- `POST /financial-data/reset` → restores the seed dataset.

### Profile
- `PATCH /financial-data/profile` — any subset of:
  ```json
  { "name": "str(1–80)", "monthly_income": ">=0", "savings_balance": ">=0",
    "emergency_fund": ">=0", "credit_score": "300–900", "currency": "str" }
  ```

### Transactions — `/financial-data/transactions`
- `POST` body: `{ "date": "YYYY-MM-DD", "merchant": "1–80", "category": "1–40", "amount": ">0" }`
- `PATCH /{id}`: any subset of the above.
- `DELETE /{id}` → `{ "deleted": "id" }`.

### Bills — `/financial-data/bills`
- `POST` body: `{ "name": "1–80", "due_date": "YYYY-MM-DD", "amount": ">0", "autopay": false }`
- `PATCH /{id}`: any subset.
- `DELETE /{id}` → `{ "deleted": "id" }`.

### Investments — `/financial-data/investments`
- `POST` body: `{ "instrument": "1–80", "value": ">=0", "monthly_contribution": ">=0", "liquid": true }`
- `PATCH /{id}`: any subset.
- `DELETE /{id}` → `{ "deleted": "id" }`.

---

## Validation rules (from `schemas.py`)

These fail with **422** before touching the store — mirror them in the UI for
instant feedback:

- Money fields: transactions/bills `amount` must be **> 0**; profile/investment
  values must be **>= 0** (no negatives).
- `credit_score`: **300–900**.
- Dates: strict `YYYY-MM-DD`.
- Text labels: non-empty, capped (see lengths above).
- `query` on `/advise`: 1–500 chars.

## Suggested build order for the frontend

1. `GET /health` — prove connectivity.
2. `GET /dashboard` — build the read-only home screen.
3. `POST /advise` — the chat/ask box + agent-trace panel.
4. CRUD screens for transactions/bills/investments/profile (dashboard updates
   automatically after each write).
