import hmac
import logging
import re
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory, session
from sqlalchemy import event
from sqlalchemy.engine import Engine
from werkzeug.exceptions import HTTPException

from .config import ROOT, load_config
from .errors import ApiError
from .extensions import cors, db, limiter, migrate

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
KEY_RE = re.compile(r"AIza[0-9A-Za-z_\-]{30,}")


class RedactFilter(logging.Filter):
    """Remove API keys / secrets from every log record."""

    def __init__(self, secrets_):
        super().__init__()
        self.secrets = [s for s in secrets_ if s and len(s) > 6]

    def _clean(self, s):
        s = KEY_RE.sub("[REDACTED]", s)
        for sec in self.secrets:
            s = s.replace(sec, "[REDACTED]")
        return s

    def filter(self, record):
        try:
            record.msg = self._clean(record.getMessage())
            record.args = ()
        except Exception:  # noqa: BLE001
            pass
        return True


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_conn, _):
    if dbapi_conn.__class__.__module__.startswith("sqlite3"):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=10000")
        cur.close()


def create_app(overrides=None):
    cfg = load_config(overrides)
    app = Flask(__name__, static_folder=None)
    app.config.update(cfg)
    for d in (cfg["UPLOAD_DIR"], cfg["CHROMA_DIR"]):
        Path(d).mkdir(parents=True, exist_ok=True)

    root_logger = logging.getLogger()
    if not any(isinstance(f, RedactFilter) for f in root_logger.filters):
        flt = RedactFilter([cfg["GEMINI_API_KEY"], cfg["SECRET_KEY"]])
        root_logger.addFilter(flt)
        for h in root_logger.handlers:
            h.addFilter(flt)
    logging.basicConfig(level=logging.INFO)
    for h in logging.getLogger().handlers:
        if not any(isinstance(f, RedactFilter) for f in h.filters):
            h.addFilter(RedactFilter([cfg["GEMINI_API_KEY"], cfg["SECRET_KEY"]]))
    logging.getLogger("werkzeug").setLevel(logging.WARNING)

    if cfg["TESSERACT_CMD"]:
        try:
            import pytesseract
            pytesseract.pytesseract.tesseract_cmd = cfg["TESSERACT_CMD"]
        except ImportError:
            pass

    db.init_app(app)
    migrate.init_app(app, db, directory=str(MIGRATIONS))
    limiter.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": cfg["CORS_ORIGINS"]}}, supports_credentials=True,
                  allow_headers=["Content-Type", "X-CSRF-Token"])

    from .routes import ai, auth, documents, system
    for m in (auth, documents, ai, system):
        app.register_blueprint(m.bp)

    if cfg["AUTO_MIGRATE"]:
        from flask_migrate import upgrade
        with app.app_context():
            upgrade(directory=str(MIGRATIONS))
        from .services.processing import recover_interrupted
        recover_interrupted(app)

    # ---------- security ----------
    @app.before_request
    def csrf_protect():
        if (not app.config["CSRF_ENABLED"] or request.method in ("GET", "HEAD", "OPTIONS")
                or not request.path.startswith("/api/")):
            return None
        sent, expected = request.headers.get("X-CSRF-Token", ""), session.get("csrf", "")
        if not expected or not hmac.compare_digest(sent, expected):
            raise ApiError("Security token missing or expired. Refresh the page and try again.", 403, "csrf_failed")

    @app.after_request
    def headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "same-origin")
        resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        resp.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
            "frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        if request.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    # ---------- errors ----------
    @app.errorhandler(ApiError)
    def api_error(e):
        return jsonify(e.to_dict()), e.status

    @app.errorhandler(HTTPException)
    def http_error(e):
        if request.path.startswith("/api/"):
            msgs = {404: "Not found.", 405: "Method not allowed.", 413: f"File is larger than {cfg['MAX_UPLOAD_MB']} MB.",
                    429: "Too many requests. Please slow down and try again shortly."}
            return jsonify({"error": {"code": (e.name or "error").lower().replace(" ", "_"),
                                      "message": msgs.get(e.code, e.description)}}), e.code
        return e

    @app.errorhandler(Exception)
    def unhandled(e):
        logging.getLogger("lexai").exception("Unhandled error")
        db.session.rollback()
        return jsonify({"error": {"code": "server_error", "message": "Something went wrong on the server."}}), 500

    # ---------- built frontend ----------
    dist = Path(ROOT / "frontend" / "dist")

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def spa(path):
        if path.startswith("api/"):
            return jsonify({"error": {"code": "not_found", "message": "Not found."}}), 404
        if dist.exists():
            target = (dist / path).resolve()
            if path and target.is_file() and dist.resolve() in target.parents:
                return send_from_directory(dist, path)
            return send_from_directory(dist, "index.html")
        return ("LexAI backend is running, but the frontend has not been built. "
                "Run the setup script, or start the dev server (see README.md).", 200)

    return app
