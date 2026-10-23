"""Document processing pipeline: extract -> clean -> chunk -> embed -> index."""
import json
import logging
import threading
from pathlib import Path

from ..errors import AIError, AIUnavailable, ExtractionError
from ..extensions import db
from ..models import Chunk, Version, utcnow
from . import extraction
from .ai import get_ai
from .chunking import chunk_pages
from .vectorstore import get_store

log = logging.getLogger("lexai.processing")


def version_path(app, v):
    return Path(app.config["UPLOAD_DIR"]) / str(v.user_id) / v.stored_name


def start_processing(app, version_id):
    if app.config["PROCESS_SYNC"]:
        process_version(app, version_id)
    else:
        threading.Thread(target=process_version, args=(app, version_id), daemon=True,
                         name=f"process-{version_id}").start()


def _set(v, status, progress, error=None):
    v.status, v.progress, v.error = status, progress, error
    db.session.commit()


def purge_vectors(app, version_id):
    try:
        get_store(app).delete_version(version_id)
    except Exception as e:  # never block deletion on vector errors
        log.warning("Vector cleanup failed for version %s: %s", version_id, type(e).__name__)


def process_version(app, version_id):
    with app.app_context():
        v = db.session.get(Version, version_id)
        if v is None:
            return
        try:
            purge_vectors(app, v.id)
            Chunk.query.filter_by(version_id=v.id).delete()
            v.chunk_count = 0
            _set(v, "extracting", 10)
            res = extraction.extract(str(version_path(app, v)), v.file_type, app.config)
            v.text = extraction.PAGE_SEP.join(res.pages)
            v.page_count = len(res.pages) if res.paged else None
            v.ocr_used = res.ocr_used
            v.warnings = json.dumps(res.warnings)
            _set(v, "chunking", 35)
            pieces = chunk_pages(res.pages, res.paged, app.config["CHUNK_SIZE"], app.config["CHUNK_OVERLAP"])
            rows = [Chunk(version_id=v.id, user_id=v.user_id, idx=i, page=p["page"], text=p["text"])
                    for i, p in enumerate(pieces)]
            db.session.add_all(rows)
            v.chunk_count = len(rows)
            db.session.commit()
            _set(v, "embedding", 45)
            try:
                ai = get_ai(app)
                store = get_store(app)
                B = 50
                for i in range(0, len(rows), B):
                    batch = rows[i:i + B]
                    vecs = ai.embed([c.text for c in batch], "document")
                    store.add([f"c{c.id}" for c in batch], vecs, [c.text for c in batch],
                              [{"user_id": v.user_id, "document_id": v.document_id, "version_id": v.id,
                                "page": c.page if c.page is not None else -1, "chunk_id": c.id} for c in batch])
                    v.progress = 45 + int(50 * min(i + B, len(rows)) / max(1, len(rows)))
                    db.session.commit()
                v.processed_at = utcnow()
                _set(v, "ready", 100)
            except AIUnavailable:
                v.processed_at = utcnow()
                _set(v, "extracted", 100,
                     "Text extracted, but semantic search and AI features need a Gemini API key. "
                     "Add GEMINI_API_KEY to .env, restart, then press Re-process.")
            except AIError as e:
                purge_vectors(app, v.id)
                v.processed_at = utcnow()
                _set(v, "extracted", 100, f"Text extracted, but indexing failed: {e.message} Press Re-process to retry.")
        except ExtractionError as e:
            db.session.rollback()
            v = db.session.get(Version, version_id)
            _set(v, "failed", 100, str(e))
        except Exception as e:  # noqa: BLE001
            db.session.rollback()
            log.exception("Processing failed for version %s", version_id)
            v = db.session.get(Version, version_id)
            _set(v, "failed", 100, f"Unexpected processing error ({type(e).__name__}). See server log.")
        finally:
            db.session.remove()


def recover_interrupted(app):
    with app.app_context():
        n = Version.query.filter(Version.status.in_(["queued", "extracting", "chunking", "embedding"])).update(
            {"status": "failed", "error": "Processing was interrupted by a restart. Press Re-process.",
             "progress": 100}, synchronize_session=False)
        db.session.commit()
        return n
