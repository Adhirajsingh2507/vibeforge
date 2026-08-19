"""TerraSight API — serves the frozen contract the frontend builds against.

Run: uvicorn app.main:app --reload  (from backend/)
Data comes from Supabase when configured, else mock JSON (see app/db.py).
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import db

app = FastAPI(title="TerraSight API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])


@app.get("/health")
def health():
    return {"status": "ok", "source": "supabase" if db._client() else "mock"}


@app.get("/map/tiles")
def map_tiles():
    return db.fetch("tiles")


@app.get("/rover/path")
def rover_path():
    return db.fetch("rover_path")


@app.get("/sites")
def sites():
    return db.fetch("sites")


@app.get("/boundaries")
def boundaries():
    return db.fetch("boundaries")
