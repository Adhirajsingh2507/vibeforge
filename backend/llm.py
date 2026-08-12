"""Gemma 4 client.

One abstraction, swappable backends, so the rest of the system never imports
transformers directly. If the Kaggle GPU dies at 3 AM, repoint LLM in one place.

Backends
--------
OpenAICompatBackend : any hosted OpenAI-compatible API (NVIDIA NIM, Groq). No GPU
                      -- the default for cloud/serverless deploys (e.g. Vercel).
                      Uses native JSON function-calling, skipping the Gemma regex.
                      Switch provider/model via env (see PROVIDERS below).
TransformersBackend : google/gemma-4-12B-it on a Kaggle/Colab GPU (4-bit default,
                      auto-fallback to fp16 sharded across all visible GPUs).
EchoBackend         : no model; deterministic canned tool-calls for offline dev
                      (lets you build agents/orchestrator on a CPU box).

Gemma 4 tool-call wire format (NOT json):
    <|tool_call>call:analyze_budget{amount:"90000"}<tool_call|>
so we parse it with a regex rather than json.loads.

Verified dependency pins (Kaggle T4 x2, 2026):
    transformers >= 5.5.0    (Gemma 4 support + function calling)
    accelerate   >= 1.0.0    (multi-GPU device_map / max_memory sharding)
    bitsandbytes == 0.48.2   (working CUDA 4-bit; MUST be a clean --no-cache-dir
                              install -- a mismatched/partial build shows up as
                              `module 'bitsandbytes' has no attribute 'functional'`)

Loading on Kaggle T4 x2 (2 x ~15GB):
  * 4-bit nf4  -> ~7GB, needs a healthy bitsandbytes. Primary path.
  * fp16       -> ~24GB, sharded 12/12 across BOTH T4s via max_memory. Fallback
                  when bitsandbytes is broken. Same -it checkpoint -- NOT the base
                  model. Reliable with zero quantization deps.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any, Callable

MODEL_ID = os.environ.get("GEMMA_MODEL", "google/gemma-4-12B-it")

# Hosted, OpenAI-compatible providers. Both are free-tier and expose the same
# /chat/completions shape, so one backend serves both -- switch via env only.
# Groq is the default: benchmarked ~0.8s and 70B-quality synthesis, beating NIM
# (whose free-tier 70B times out; only its weaker 8B is fast enough). NIM stays as
# a fallback. Order matters -- auto-detect prefers the first provider whose key set.
PROVIDERS = {
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "key_env": "GROQ_API_KEY",
        "default_model": "llama-3.3-70b-versatile",
    },
    "nim": {
        "base_url": "https://integrate.api.nvidia.com/v1",
        "key_env": "NVIDIA_API_KEY",
        "default_model": "meta/llama-3.1-8b-instruct",
    },
}

# --- tool-call parsing -------------------------------------------------------

_CALL_RE = re.compile(r"<\|tool_call>call:(\w+)\{(.*?)\}<tool_call\|>", re.DOTALL)
# Gemma wraps STRING args in its special quote token <|"|> (not plain quotes),
# e.g. target:<|"|>apple-sale-90off.xyz<|"|>. Match that first, then "...", then bare.
_ARG_RE = re.compile(r'(\w+)\s*:\s*(?:<\|"\|>(.*?)<\|"\|>|"([^"]*)"|([^,}]+))')

# Gemma control/special tokens that must never reach the user-visible text.
_SPECIAL_TOKEN_RE = re.compile(
    r'<\|"\|>|<\|?\/?(?:tool_call|channel|message|end|turn|start_of_turn|'
    r'end_of_turn|eos|bos|thought)\|?>|<turn\|>|<end_of_turn>|<eos>|<bos>',
    re.IGNORECASE,
)


def _coerce(v: str) -> Any:
    v = v.strip().strip('<|"|>').strip()  # belt-and-braces: drop stray quote-token bits
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    if re.fullmatch(r"-?\d*\.\d+", v):
        return float(v)
    if v.lower() in {"true", "false"}:
        return v.lower() == "true"
    return v


def parse_tool_calls(text: str) -> list[dict]:
    """Extract [{name, arguments}] from a Gemma 4 completion."""
    calls = []
    for name, args in _CALL_RE.findall(text):
        parsed = {}
        for key, gq, dq, bare in _ARG_RE.findall(args):
            val = gq if gq != "" else dq if dq != "" else bare
            parsed[key] = _coerce(val)
        calls.append({"name": name, "arguments": parsed})
    return calls


def strip_tool_calls(text: str) -> str:
    """The prose the model wrote alongside/instead of tool calls."""
    return _CALL_RE.sub("", text).strip()


def scrub(text: str) -> str:
    """Remove Gemma control tokens and thinking-channel noise from user-visible text."""
    if not text:
        return text
    # Drop a leading thinking channel block if present (<|channel>thought ... ).
    text = re.sub(r"<\|channel>thought.*?(?=<\||$)", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = _SPECIAL_TOKEN_RE.sub("", text)
    # Collapse any residual angle-bracket control fragments like <|...>.
    text = re.sub(r"<\|[^>]{0,24}>", "", text)
    return re.sub(r"[ \t]+\n", "\n", text).strip()


# --- backends ----------------------------------------------------------------


@dataclass
class GenResult:
    text: str
    tool_calls: list[dict] = field(default_factory=list)


def _bnb_healthy() -> bool:
    """True only if bitsandbytes imported WITH its CUDA backend. A partial/broken
    install (the Kaggle failure mode) is missing `functional`/`nn`, which is what
    raised `module 'bitsandbytes' has no attribute 'functional'`."""
    try:
        import bitsandbytes as bnb
        return hasattr(bnb, "functional") and hasattr(bnb, "nn")
    except Exception:
        return False


def _max_memory_map(headroom_gib: float = 2.0, cpu_gib: int = 20) -> dict:
    """Reserve headroom per visible GPU so accelerate shards across ALL of them
    instead of over-filling GPU 0 (the cause of the 'GPU 1 only 80MiB free' OOM)."""
    import torch

    mm: dict = {}
    for i in range(torch.cuda.device_count()):
        total_gib = torch.cuda.get_device_properties(i).total_memory / (1024 ** 3)
        usable = max(1, int(total_gib - headroom_gib))
        mm[i] = f"{usable}GiB"
    mm["cpu"] = f"{cpu_gib}GiB"
    return mm


class TransformersBackend:
    """Gemma 4 via HF transformers. Lazy-loads the model on first generate().

    Load strategy: try 4-bit if bitsandbytes is healthy, else fp16 -- always
    sharded across every visible GPU via an explicit max_memory map. The fallback
    keeps the SAME -it checkpoint; it never swaps to the base model.
    """

    def __init__(self, model_id: str = MODEL_ID, load_in_4bit: bool = True,
                 dtype: str = "float16"):
        self.model_id = model_id
        self.load_in_4bit = load_in_4bit
        self.dtype = dtype
        self._model = None
        self._processor = None
        self.load_mode = None  # '4bit' or 'fp16', set after loading

    def _ensure_loaded(self):
        if self._model is not None:
            return
        import gc

        import torch
        from transformers import AutoModelForImageTextToText, AutoProcessor

        # Clear any residue from a previously failed load (leaked GPU 1 memory).
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()

        torch_dtype = {"float16": torch.float16, "bfloat16": torch.bfloat16}[self.dtype]
        kw: dict = {"device_map": "auto", "low_cpu_mem_usage": True}
        if torch.cuda.device_count() >= 1:
            kw["max_memory"] = _max_memory_map()

        want_4bit = self.load_in_4bit and _bnb_healthy()
        if self.load_in_4bit and not want_4bit:
            print("[llm] bitsandbytes unavailable/broken -> loading fp16 sharded "
                  "across all GPUs (same -it checkpoint, no base-model fallback).")

        if want_4bit:
            from transformers import BitsAndBytesConfig

            kw["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch_dtype,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
            )
        else:
            kw["dtype"] = torch_dtype

        self._processor = AutoProcessor.from_pretrained(self.model_id)
        try:
            self._model = AutoModelForImageTextToText.from_pretrained(self.model_id, **kw)
            self.load_mode = "4bit" if want_4bit else "fp16"
        except Exception as e:
            # Last-resort: if 4-bit blew up mid-load, retry fp16 sharded before giving up.
            if want_4bit:
                print(f"[llm] 4-bit load failed ({type(e).__name__}: {e}); "
                      "retrying fp16 sharded across all GPUs.")
                gc.collect()
                torch.cuda.empty_cache()
                kw.pop("quantization_config", None)
                kw["dtype"] = torch_dtype
                self._model = AutoModelForImageTextToText.from_pretrained(self.model_id, **kw)
                self.load_mode = "fp16"
            else:
                raise
        print(f"[llm] loaded {self.model_id} in {self.load_mode} mode; "
              f"device map: {getattr(self._model, 'hf_device_map', 'n/a')}")

    def generate(self, messages: list[dict], tools: list[dict] | None = None,
                 image=None, max_new_tokens: int = 512,
                 enable_thinking: bool = False) -> GenResult:
        self._ensure_loaded()
        import torch

        # Attach an image to the last user turn if provided (multimodal path).
        if image is not None and messages and messages[-1]["role"] == "user":
            content = messages[-1]["content"]
            if isinstance(content, str):
                content = [{"type": "text", "text": content}]
            content = [{"type": "image", "image": image}] + content
            messages = messages[:-1] + [{"role": "user", "content": content}]

        template_kw: dict = {"add_generation_prompt": True, "tokenize": True,
                             "return_dict": True, "return_tensors": "pt"}
        if tools:
            template_kw["tools"] = tools
        if enable_thinking:
            template_kw["enable_thinking"] = True

        inputs = self._processor.apply_chat_template(messages, **template_kw)
        inputs = {k: v.to(self._model.device) for k, v in inputs.items()}
        in_len = inputs["input_ids"].shape[-1]

        with torch.no_grad():
            out = self._model.generate(**inputs, max_new_tokens=max_new_tokens,
                                       do_sample=False)
        # Decode WITH special tokens so tool-call markers survive for the parser...
        raw = self._processor.decode(out[0][in_len:], skip_special_tokens=False)
        tool_calls = parse_tool_calls(raw)
        # ...then produce clean, user-safe prose (no <turn|>, <|channel>, <|"|>, etc.).
        prose = scrub(strip_tool_calls(raw))
        return GenResult(text=prose, tool_calls=tool_calls)


class OpenAICompatBackend:
    """Llama/Gemma-class model via any hosted OpenAI-compatible API (NIM, Groq).

    No GPU, no model download -- one HTTPS call per generation. This is the
    default for cloud/serverless deploys. These APIs return native JSON tool_calls,
    so we parse those directly instead of the Gemma <|tool_call> wire format.
    """

    def __init__(self, provider: str = "groq", model_id: str | None = None,
                 api_key: str | None = None):
        cfg = PROVIDERS.get(provider)
        if cfg is None:
            raise ValueError(f"unknown LLM provider {provider!r}; known: {list(PROVIDERS)}")
        self.provider = provider
        self.base_url = os.environ.get("LLM_BASE_URL", cfg["base_url"]).rstrip("/")
        self.model_id = model_id or os.environ.get("LLM_MODEL", cfg["default_model"])
        self.api_key = api_key or os.environ.get(cfg["key_env"]) or os.environ.get("LLM_API_KEY")
        if not self.api_key:
            raise RuntimeError(f"{cfg['key_env']} is not set; cannot use the {provider} backend.")
        self.load_mode = "api"

    def generate(self, messages: list[dict], tools: list[dict] | None = None,
                 image=None, max_new_tokens: int = 512,
                 enable_thinking: bool = False) -> GenResult:
        import httpx

        # These APIs want plain-string content; our messages already are (image unused).
        body: dict = {
            "model": self.model_id,
            "messages": [{"role": m["role"], "content": _as_text(m["content"])} for m in messages],
            "max_tokens": max_new_tokens,
            "temperature": 0,
        }
        if tools:
            body["tools"] = tools
            body["tool_choice"] = "auto"

        r = httpx.post(f"{self.base_url}/chat/completions", json=body, timeout=60,
                       headers={"Authorization": f"Bearer {self.api_key}"})
        r.raise_for_status()
        msg = r.json()["choices"][0]["message"]

        calls = []
        for tc in msg.get("tool_calls") or []:
            fn = tc.get("function", {})
            args = fn.get("arguments") or "{}"
            if isinstance(args, str):
                import json
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {}
            calls.append({"name": fn.get("name"), "arguments": args})

        return GenResult(text=scrub(msg.get("content") or ""), tool_calls=calls)


def _as_text(content) -> str:
    """Flatten a possibly-multimodal message content to plain text for Groq."""
    if isinstance(content, list):
        return " ".join(p.get("text", "") for p in content if isinstance(p, dict))
    return content or ""


class EchoBackend:
    """CPU-only stand-in. A rule function decides the canned response so the
    orchestrator/agents can be built and tested with zero GPU."""

    def __init__(self, script: Callable[[list[dict], list[dict] | None], GenResult] | None = None):
        self.script = script or self._default

    @staticmethod
    def _default(messages, tools) -> GenResult:
        last = messages[-1]["content"] if messages else ""
        if isinstance(last, list):
            last = " ".join(p.get("text", "") for p in last if isinstance(p, dict))
        return GenResult(text=f"[echo] I received: {last}", tool_calls=[])

    def generate(self, messages, tools=None, image=None, max_new_tokens=512,
                 enable_thinking=False) -> GenResult:
        return self.script(messages, tools)


def make_backend(kind: str = "auto"):
    """kind: 'nim' | 'groq' | 'transformers' | 'echo' | 'auto'.

    auto: a hosted provider if its key is set (NIM, then Groq -- the cloud
    default), else transformers if a GPU is visible (Kaggle), else the echo stub.
    """
    if kind in PROVIDERS:
        return OpenAICompatBackend(kind)
    if kind == "echo":
        return EchoBackend()
    if kind == "transformers":
        return TransformersBackend()
    for provider, cfg in PROVIDERS.items():
        if os.environ.get(cfg["key_env"]):
            return OpenAICompatBackend(provider)
    try:
        import torch
        if torch.cuda.is_available():
            return TransformersBackend()
    except Exception:
        pass
    return EchoBackend()
