"""Document scanner -- turn an uploaded bill / bank statement into importable rows.

Images (photos, scans) go to a Groq vision model; digital PDFs are read with
pypdf and sent to the text model. Either way the LLM returns strict JSON, which
we validate against the same pydantic schemas the manual editor uses -- so
nothing enters the store that couldn't have been typed by hand.

Env:
  GROQ_API_KEY       (required)   -- same key the advisor uses
  LLM_VISION_MODEL   (optional)   -- Groq multimodal model for images
  LLM_MODEL          (optional)   -- text model for digital PDFs
"""

from __future__ import annotations

import base64
import json
import os
import re

import httpx

from schemas import BillIn, TransactionIn

GROQ_BASE = "https://api.groq.com/openai/v1"
TEXT_MODEL = os.environ.get("LLM_MODEL", "llama-3.3-70b-versatile")

# Vision is pluggable: point at ANY OpenAI-compatible vision provider via env.
# Groq currently ships no vision model, so images need e.g. Google Gemini:
#   LLM_VISION_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
#   LLM_VISION_API_KEY=<gemini key>   LLM_VISION_MODEL=gemini-2.5-flash
VISION_BASE = os.environ.get("LLM_VISION_BASE_URL", GROQ_BASE)
VISION_KEY = os.environ.get("LLM_VISION_API_KEY") or os.environ.get("GROQ_API_KEY", "")
VISION_MODEL = os.environ.get("LLM_VISION_MODEL", "")
_NO_VISION_MSG = ("Image scanning needs a vision model. This Groq key has none — "
                  "set LLM_VISION_BASE_URL, LLM_VISION_API_KEY and LLM_VISION_MODEL "
                  "(e.g. Google Gemini). Digital (text) PDFs work without it.")

_PROMPT = (
    "You are a financial-document parser. From the document, extract every "
    "transaction and every upcoming bill you can find. Respond with ONLY a JSON "
    "object, no prose, no code fences, in exactly this shape:\n"
    '{"transactions":[{"date":"YYYY-MM-DD","merchant":"","category":"","amount":0}],'
    '"bills":[{"name":"","due_date":"YYYY-MM-DD","amount":0,"autopay":false}]}\n'
    "Rules: amounts are POSITIVE numbers in rupees (no symbols/commas). Pick a "
    "sensible category (Groceries, Utilities, Rent, Dining, Transport, etc). If a "
    "date is missing, omit that field. Return empty arrays if nothing is found."
)

_IMAGE_TYPES = ("image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def extract(data: bytes, content_type: str, filename: str) -> dict:
    """-> {'transactions': [...], 'bills': [...], 'note': str}. Never raises for
    parse issues; returns an 'error' key on hard failures (no key, model error)."""
    if not os.environ.get("GROQ_API_KEY"):
        return {"error": "Scanning needs GROQ_API_KEY set on the server.", "transactions": [], "bills": []}

    ct = (content_type or "").lower()
    name = (filename or "").lower()
    is_image = ct in _IMAGE_TYPES or name.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif"))
    if is_image and not VISION_MODEL:
        return {"error": _NO_VISION_MSG, "transactions": [], "bills": []}
    try:
        if is_image:
            raw = _vision(data, ct or "image/jpeg")
        elif ct == "application/pdf" or name.endswith(".pdf"):
            text = _pdf_text(data)
            if len(text.strip()) < 40:
                return {"error": "This looks like a scanned PDF with no selectable text. "
                                 "Please upload the page as a photo/image instead.",
                        "transactions": [], "bills": []}
            raw = _text(text)
        else:
            return {"error": f"Unsupported file type: {content_type or 'unknown'}. "
                             "Upload a photo, PNG/JPG, or a text PDF.",
                    "transactions": [], "bills": []}
    except httpx.HTTPStatusError as e:
        return {"error": f"Model request failed ({e.response.status_code}). "
                         "Check LLM_VISION_MODEL / GROQ_API_KEY.", "transactions": [], "bills": []}
    except Exception as e:  # noqa: BLE001 - surface a clean message to the UI
        return {"error": f"Could not read the document: {e}", "transactions": [], "bills": []}

    parsed = _parse_json(raw)
    txns = _valid_transactions(parsed.get("transactions"))
    bills = _valid_bills(parsed.get("bills"))
    note = f"Found {len(txns)} transaction(s) and {len(bills)} bill(s)."
    if not txns and not bills:
        note = "No transactions or bills could be read from this document."
    return {"transactions": txns, "bills": bills, "note": note}


# --- LLM calls ---------------------------------------------------------------
def _chat(base: str, key: str, model: str, messages: list[dict]) -> str:
    r = httpx.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {key}"},
        json={"model": model, "messages": messages, "temperature": 0, "max_tokens": 1500},
        timeout=90,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"] or ""


def _vision(data: bytes, mime: str) -> str:
    url = f"data:{mime};base64,{base64.b64encode(data).decode()}"
    return _chat(VISION_BASE, VISION_KEY, VISION_MODEL, [{"role": "user", "content": [
        {"type": "text", "text": _PROMPT},
        {"type": "image_url", "image_url": {"url": url}},
    ]}])


def _text(doc: str) -> str:
    return _chat(GROQ_BASE, os.environ["GROQ_API_KEY"], TEXT_MODEL,
                 [{"role": "user", "content": f"{_PROMPT}\n\nDocument:\n{doc[:12000]}"}])


def _pdf_text(data: bytes) -> str:
    from io import BytesIO

    from pypdf import PdfReader
    reader = PdfReader(BytesIO(data))
    return "\n".join((p.extract_text() or "") for p in reader.pages[:10])


# --- parsing + validation ----------------------------------------------------
def _parse_json(raw: str) -> dict:
    raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    i, j = raw.find("{"), raw.rfind("}")
    if i == -1 or j == -1:
        return {}
    try:
        obj = json.loads(raw[i:j + 1])
        return obj if isinstance(obj, dict) else {}
    except Exception:
        return {}


def _num(v) -> float:
    if isinstance(v, (int, float)):
        return abs(float(v))
    return abs(float(re.sub(r"[^0-9.\-]", "", str(v)) or 0))


def _date(v) -> str | None:
    s = str(v or "").strip()[:10]
    return s if _DATE_RE.match(s) else None


def _valid_transactions(items) -> list[dict]:
    out = []
    for it in items or []:
        if not isinstance(it, dict):
            continue
        try:
            amount = _num(it.get("amount"))
            if amount <= 0:
                continue
            row = TransactionIn(
                date=_date(it.get("date")) or _today(),
                merchant=str(it.get("merchant") or it.get("description") or "Unknown")[:80] or "Unknown",
                category=str(it.get("category") or "Uncategorized")[:40] or "Uncategorized",
                amount=amount,
            )
            out.append(row.model_dump())
        except Exception:
            continue
    return out


def _valid_bills(items) -> list[dict]:
    out = []
    for it in items or []:
        if not isinstance(it, dict):
            continue
        try:
            amount = _num(it.get("amount"))
            if amount <= 0:
                continue
            row = BillIn(
                name=str(it.get("name") or it.get("merchant") or "Bill")[:80] or "Bill",
                due_date=_date(it.get("due_date")) or _today(),
                amount=amount,
                autopay=bool(it.get("autopay")),
            )
            out.append(row.model_dump())
        except Exception:
            continue
    return out


def _today() -> str:
    from datetime import date
    return date.today().isoformat()
