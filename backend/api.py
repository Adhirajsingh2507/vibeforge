"""FastAPI layer -- thin HTTP over the shared service + mutable financial store.

No business logic here: advice goes through the Orchestrator, all math stays in
finance_engine, all state lives in financial_store. This module also serves the
single-page premium UI (web/index.html) as static files.

Endpoints
    GET  /health
    GET  /dashboard
    POST /advise
    GET  /financial-data
    PATCH  /financial-data/profile
    POST/PATCH/DELETE  /financial-data/transactions[/{id}]
    POST/PATCH/DELETE  /financial-data/bills[/{id}]
    POST/PATCH/DELETE  /financial-data/investments[/{id}]
    POST /financial-data/reset
    GET  /            -> the web app

Run: uvicorn api:app --host 0.0.0.0 --port 8000   (from src/)
"""

from __future__ import annotations

import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import financial_store as store
import service
from schemas import (AdviseRequest, BillIn, BillPatch, InvestmentIn,
                     InvestmentPatch, ProfilePatch, TransactionIn, TransactionPatch)

app = FastAPI(title="Multi-Agent Personal CFO", version="2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])

# Locate the SPA: web/ sits beside src/ in the repo (../web), but in the flat
# Kaggle notebook the modules and web/ live in the same dir (./web). Try both.
_HERE = os.path.dirname(__file__)
_WEB = os.environ.get("CFO_WEB_DIR") or next(
    (p for p in (os.path.join(_HERE, "..", "web"), os.path.join(_HERE, "web"))
     if os.path.isdir(p)),
    os.path.join(_HERE, "..", "web"))


# --- core ---
@app.get("/health")
def health():
    return service.health()


@app.get("/dashboard")
def dashboard():
    return service.dashboard()


@app.post("/advise")
def advise(req: AdviseRequest):
    return service.advise(req.query, session_id=req.session_id,
                          context_token=req.context_token)


@app.get("/_models")  # temporary diagnostic: list Groq model ids available to this key
def list_models():
    import os

    import httpx
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        return {"error": "no GROQ_API_KEY"}
    r = httpx.get("https://api.groq.com/openai/v1/models",
                  headers={"Authorization": f"Bearer {key}"}, timeout=30)
    ids = sorted(m["id"] for m in r.json().get("data", []))
    return {"models": ids, "vision_hint": [m for m in ids if any(
        k in m for k in ("vision", "scout", "maverick", "llama-4", "vl"))]}


@app.post("/scan")
def scan(file: UploadFile = File(...)):
    data = file.file.read()
    if not data:
        raise HTTPException(400, "empty file")
    if len(data) > 20_000_000:  # 20 MB cap (Vercel accepts up to 100MB; this is plenty)
        raise HTTPException(413, "file too large (max 20 MB)")
    return service.scan(data, file.content_type or "", file.filename or "")


# --- conversation sessions (multi-turn) ---
@app.post("/conversation/new")
def new_conversation():
    return service.new_session()


@app.post("/conversation/{session_id}/clear")
def clear_conversation(session_id: str):
    return service.clear_session(session_id)


# --- financial data: read ---
@app.get("/financial-data")
def financial_data():
    return store.get_state()


@app.post("/financial-data/reset")
def reset():
    return store.reset()


# --- profile ---
@app.patch("/financial-data/profile")
def patch_profile(patch: ProfilePatch):
    return store.patch_profile(patch.model_dump(exclude_unset=True))


# --- transactions ---
@app.post("/financial-data/transactions")
def add_txn(item: TransactionIn):
    return store.add_transaction(item.model_dump())


@app.patch("/financial-data/transactions/{item_id}")
def patch_txn(item_id: str, patch: TransactionPatch):
    rec = store.update_transaction(item_id, patch.model_dump(exclude_unset=True))
    if rec is None:
        raise HTTPException(404, "transaction not found")
    return rec


@app.delete("/financial-data/transactions/{item_id}")
def del_txn(item_id: str):
    if not store.delete_transaction(item_id):
        raise HTTPException(404, "transaction not found")
    return {"deleted": item_id}


# --- bills ---
@app.post("/financial-data/bills")
def add_bill(item: BillIn):
    return store.add_bill(item.model_dump())


@app.patch("/financial-data/bills/{item_id}")
def patch_bill(item_id: str, patch: BillPatch):
    rec = store.update_bill(item_id, patch.model_dump(exclude_unset=True))
    if rec is None:
        raise HTTPException(404, "bill not found")
    return rec


@app.delete("/financial-data/bills/{item_id}")
def del_bill(item_id: str):
    if not store.delete_bill(item_id):
        raise HTTPException(404, "bill not found")
    return {"deleted": item_id}


# --- investments ---
@app.post("/financial-data/investments")
def add_inv(item: InvestmentIn):
    return store.add_investment(item.model_dump())


@app.patch("/financial-data/investments/{item_id}")
def patch_inv(item_id: str, patch: InvestmentPatch):
    rec = store.update_investment(item_id, patch.model_dump(exclude_unset=True))
    if rec is None:
        raise HTTPException(404, "investment not found")
    return rec


@app.delete("/financial-data/investments/{item_id}")
def del_inv(item_id: str):
    if not store.delete_investment(item_id):
        raise HTTPException(404, "investment not found")
    return {"deleted": item_id}


# --- static web app (mounted last so it doesn't shadow API routes) ---
if os.path.isdir(_WEB):
    @app.get("/")
    def index():
        return FileResponse(os.path.join(_WEB, "index.html"))

    app.mount("/", StaticFiles(directory=_WEB), name="web")
