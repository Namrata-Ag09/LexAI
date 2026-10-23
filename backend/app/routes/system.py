from flask import Blueprint, current_app, jsonify
from sqlalchemy import text

from ..extensions import db
from ..services.extraction import ocr_status
from ..services.vectorstore import get_store

bp = Blueprint("system", __name__, url_prefix="/api")


@bp.get("/health")
def health():
    cfg = current_app.config
    checks = {}
    try:
        db.session.execute(text("select 1"))
        checks["database"] = {"ok": True}
    except Exception as e:  # noqa: BLE001
        checks["database"] = {"ok": False, "detail": type(e).__name__}
    try:
        checks["vector_store"] = {"ok": True, "chunks_indexed": get_store(current_app._get_current_object()).count()}
    except Exception as e:  # noqa: BLE001
        checks["vector_store"] = {"ok": False, "detail": type(e).__name__}
    ocr_ok, detail = ocr_status(cfg)
    checks["ocr"] = {"ok": ocr_ok, "detail": "ready" if ocr_ok else detail, "optional": True}
    ai_ok = bool(cfg["GEMINI_API_KEY"]) or current_app.extensions.get("lexai_ai") is not None
    checks["ai"] = {"ok": ai_ok, "configured": ai_ok, "chat_model": cfg["GEMINI_CHAT_MODEL"],
                    "embed_model": cfg["GEMINI_EMBED_MODEL"],
                    "detail": "API key configured (live connectivity is not tested here)" if ai_ok
                    else "Set GEMINI_API_KEY in .env to enable AI features"}
    return jsonify({"status": "ok" if checks["database"]["ok"] and checks["vector_store"]["ok"] else "degraded",
                    "checks": checks, "limits": {"max_upload_mb": cfg["MAX_UPLOAD_MB"],
                                                 "registration_open": cfg["ALLOW_REGISTRATION"]}})
