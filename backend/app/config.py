"""Configuration. Everything is overridable through environment variables / .env."""
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]


def _int(name, default):
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


def _bool(name, default):
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _secret_key(data_dir: Path) -> str:
    env = os.getenv("SECRET_KEY", "").strip()
    if env:
        return env
    f = data_dir / "secret_key"
    if f.exists():
        return f.read_text().strip()
    key = secrets.token_hex(32)
    f.write_text(key)
    try:
        os.chmod(f, 0o600)
    except OSError:
        pass
    return key


def load_config(overrides=None) -> dict:
    load_dotenv(ROOT / ".env")
    data_dir = Path(os.getenv("LEXAI_DATA_DIR") or (ROOT / "data")).resolve()
    if overrides and overrides.get("DATA_DIR"):
        data_dir = Path(overrides["DATA_DIR"]).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    max_mb = _int("MAX_UPLOAD_MB", 25)
    cfg = {
        "DATA_DIR": str(data_dir),
        "UPLOAD_DIR": str(data_dir / "uploads"),
        "CHROMA_DIR": str(data_dir / "chroma"),
        "SQLALCHEMY_DATABASE_URI": "sqlite:///" + (data_dir / "lexai.db").as_posix(),
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "SECRET_KEY": _secret_key(data_dir),
        "SESSION_COOKIE_HTTPONLY": True,
        "SESSION_COOKIE_SAMESITE": "Lax",
        "SESSION_COOKIE_SECURE": _bool("COOKIE_SECURE", False),
        "PERMANENT_SESSION_LIFETIME": _int("SESSION_HOURS", 12) * 3600,
        "MAX_UPLOAD_MB": max_mb,
        "MAX_CONTENT_LENGTH": (max_mb + 1) * 1024 * 1024,
        "MAX_PDF_PAGES": _int("MAX_PDF_PAGES", 500),
        "CORS_ORIGINS": [o.strip() for o in os.getenv(
            "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()],
        "RATELIMIT_ENABLED": _bool("RATE_LIMIT_ENABLED", True),
        "RATELIMIT_STORAGE_URI": "memory://",
        "CSRF_ENABLED": True,
        # AI
        "GEMINI_API_KEY": os.getenv("GEMINI_API_KEY", "").strip(),
        "GEMINI_CHAT_MODEL": os.getenv("GEMINI_CHAT_MODEL", "gemini-2.5-flash"),
        "GEMINI_EMBED_MODEL": os.getenv("GEMINI_EMBED_MODEL", "gemini-embedding-001"),
        "EMBED_DIM": _int("EMBED_DIM", 768),
        "AI_RETRIES": _int("AI_RETRIES", 3),
        "MAX_CONTEXT_CHARS": _int("MAX_CONTEXT_CHARS", 80000),
        # Processing
        "CHUNK_SIZE": _int("CHUNK_SIZE", 1200),
        "CHUNK_OVERLAP": _int("CHUNK_OVERLAP", 200),
        "OCR_ENABLED": _bool("OCR_ENABLED", True),
        "OCR_MIN_CHARS": _int("OCR_MIN_CHARS", 25),
        "TESSERACT_CMD": os.getenv("TESSERACT_CMD", "").strip(),
        "PROCESS_SYNC": False,
        "AUTO_MIGRATE": True,
        "TOP_K": _int("TOP_K", 8),
        "MIN_PASSWORD_LENGTH": _int("MIN_PASSWORD_LENGTH", 10),
        "ALLOW_REGISTRATION": _bool("ALLOW_REGISTRATION", True),
    }
    if overrides:
        cfg.update({k: v for k, v in overrides.items() if k != "DATA_DIR"})
        if "DATA_DIR" in overrides:
            cfg["DATA_DIR"] = str(data_dir)
    return cfg
