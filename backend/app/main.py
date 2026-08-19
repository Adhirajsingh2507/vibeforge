"""TerraSight API — serves the frozen contract the frontend builds against.

Run: uvicorn app.main:app --reload  (from backend/)
Swaps mock JSON for live pipeline output once the CV modules land.
"""
import json
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

MOCK = Path(__file__).resolve().parent.parent / "mock"
app = FastAPI(title="TerraSight API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])


def _load(name: str):
    return json.loads((MOCK / name).read_text())


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/map/tiles")
def map_tiles():
    return _load("tiles.json")


@app.get("/rover/path")
def rover_path():
    return _load("path.json")


@app.get("/sites")
def sites():
    return _load("sites.json")


@app.get("/boundaries")
def boundaries():
    return _load("boundaries.json")
