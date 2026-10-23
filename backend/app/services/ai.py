"""Gemini provider. The API key lives only in backend config."""
import json
import math
import re
import time

from flask import current_app

from ..errors import AIError, AIUnavailable

KEY_PATTERN = re.compile(r"AIza[0-9A-Za-z_\-]{30,}")


def _normalize(vec):
    n = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / n for x in vec]


def parse_json(text):
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    raise AIError("The AI returned an unreadable answer. Please try again.")


class GeminiClient:
    def __init__(self, api_key, chat_model, embed_model, dim, retries=3):
        from google import genai

        self._genai_types = __import__("google.genai.types", fromlist=["types"])
        self.client = genai.Client(api_key=api_key)
        self.chat_model, self.embed_model, self.dim, self.retries = chat_model, embed_model, dim, retries

    def _call(self, fn):
        delay = 1.0
        last = None
        for attempt in range(max(1, self.retries)):
            try:
                return fn()
            except Exception as e:  # SDK raises google.genai.errors.APIError subclasses
                last = e
                code = getattr(e, "code", None)
                if code in (400, 401, 403):
                    raise AIError("Gemini rejected the request. Check that GEMINI_API_KEY is valid "
                                  "and the configured model names exist.") from None
                if attempt < self.retries - 1:
                    time.sleep(delay)
                    delay *= 2
        code = getattr(last, "code", None)
        msg = "Gemini is rate-limiting requests. Wait a moment and retry." if code == 429 else \
            "Could not reach Gemini. Check your internet connection and try again."
        raise AIError(msg) from None

    def embed(self, texts, kind="document"):
        t = self._genai_types
        task = "RETRIEVAL_DOCUMENT" if kind == "document" else "RETRIEVAL_QUERY"
        out = []
        for i in range(0, len(texts), 50):
            batch = texts[i:i + 50]
            res = self._call(lambda b=batch: self.client.models.embed_content(
                model=self.embed_model, contents=b,
                config=t.EmbedContentConfig(task_type=task, output_dimensionality=self.dim)))
            out.extend(_normalize(list(e.values)) for e in res.embeddings)
        return out

    def generate_json(self, system, prompt):
        t = self._genai_types
        res = self._call(lambda: self.client.models.generate_content(
            model=self.chat_model, contents=prompt,
            config=t.GenerateContentConfig(system_instruction=system, temperature=0.1,
                                           response_mime_type="application/json")))
        return parse_json(res.text)


def get_ai(app=None):
    """Return the AI client (tests may inject app.extensions['lexai_ai'])."""
    app = app or current_app._get_current_object()
    injected = app.extensions.get("lexai_ai")
    if injected is not None:
        return injected
    key = app.config.get("GEMINI_API_KEY")
    if not key:
        raise AIUnavailable()
    client = GeminiClient(key, app.config["GEMINI_CHAT_MODEL"], app.config["GEMINI_EMBED_MODEL"],
                          app.config["EMBED_DIM"], app.config["AI_RETRIES"])
    app.extensions["lexai_ai"] = client
    return client


def ai_signature(app):
    ai = app.extensions.get("lexai_ai")
    if ai is not None:
        return ai.embed_model, ai.dim
    return app.config["GEMINI_EMBED_MODEL"], app.config["EMBED_DIM"]
