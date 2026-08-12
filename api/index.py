"""Vercel Python entrypoint: serves the FastAPI backend + the web/ SPA.

Vercel runs one serverless function from this file (exposing the ASGI `app`).
The backend keeps state in memory + /tmp (the only writable path on Vercel), so
reads and a single session work; edits reset on cold start -- see README (demo).
"""

import os
import sys

_ROOT = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, os.path.join(_ROOT, "backend"))

# /tmp is the only writable dir on Vercel; point the JSON store there before the
# store module is imported (it reads CFO_DATA_FILE at import time).
os.environ.setdefault("CFO_DATA_FILE", "/tmp/financial_data.json")
os.environ.setdefault("CFO_WEB_DIR", os.path.join(_ROOT, "web"))

from api import app  # noqa: E402  (path set above)
