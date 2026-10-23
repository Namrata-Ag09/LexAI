import uuid
from hashlib import sha256
from pathlib import Path

from flask import Blueprint, current_app, g, jsonify, request, send_file
from werkzeug.utils import secure_filename

from ..errors import ApiError, NotFound
from ..extensions import db
from ..models import Chunk, Document, Version, utcnow
from ..services import extraction
from ..services.processing import purge_vectors, start_processing, version_path
from ..utils import body, login_required, owned_document, owned_version, paging

bp = Blueprint("documents", __name__, url_prefix="/api/documents")
ALLOWED = {"pdf", "docx"}


def _save_upload(user_id):
    f = request.files.get("file")
    if f is None or not f.filename:
        raise ApiError("Choose a PDF or DOCX file to upload.", 400, "no_file")
    original = secure_filename(f.filename) or "document"
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else ""
    if ext not in ALLOWED:
        raise ApiError("Only PDF and DOCX files are supported.", 415, "unsupported_type")
    cfg = current_app.config
    folder = Path(cfg["UPLOAD_DIR"]) / str(user_id)
    folder.mkdir(parents=True, exist_ok=True)
    stored = f"{uuid.uuid4().hex}.{ext}"
    path = folder / stored
    f.save(path)
    size = path.stat().st_size
    try:
        if size == 0:
            raise ApiError("The uploaded file is empty.", 400, "empty_file")
        if size > cfg["MAX_UPLOAD_MB"] * 1024 * 1024:
            raise ApiError(f"File is larger than {cfg['MAX_UPLOAD_MB']} MB.", 413, "file_too_large")
        try:
            extraction.validate_file(str(path), ext)
        except Exception as e:
            raise ApiError(str(e), 422, "invalid_file") from None
        digest = sha256(path.read_bytes()).hexdigest()
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return original, stored, ext, size, digest


def _new_version(doc, saved):
    original, stored, ext, size, digest = saved
    n = (doc.latest.version_number + 1) if doc.latest else 1
    v = Version(document_id=doc.id, user_id=doc.user_id, version_number=n, filename=original,
                stored_name=stored, file_type=ext, size_bytes=size, sha256=digest)
    db.session.add(v)
    return v


@bp.get("")
@login_required
def list_documents():
    page, per = paging()
    q = Document.query.filter_by(user_id=g.user.id)
    term = (request.args.get("q") or "").strip()
    if term:
        q = q.filter(Document.title.ilike(f"%{term.replace('%', '')}%"))
    total = q.count()
    items = q.order_by(Document.updated_at.desc()).offset((page - 1) * per).limit(per).all()
    return jsonify({"items": [d.to_dict() for d in items], "total": total, "page": page, "per_page": per})


@bp.post("")
@login_required
def upload_document():
    saved = _save_upload(g.user.id)
    title = (request.form.get("title") or "").strip()[:255] or saved[0].rsplit(".", 1)[0]
    doc = Document(user_id=g.user.id, title=title)
    db.session.add(doc)
    db.session.flush()
    v = _new_version(doc, saved)
    db.session.commit()
    start_processing(current_app._get_current_object(), v.id)
    db.session.expire_all()
    return jsonify({"document": doc.to_dict(with_versions=True)}), 202


@bp.get("/<int:doc_id>")
@login_required
def get_document(doc_id):
    return jsonify({"document": owned_document(doc_id).to_dict(with_versions=True)})


@bp.patch("/<int:doc_id>")
@login_required
def rename_document(doc_id):
    d = owned_document(doc_id)
    title = str(body().get("title", "")).strip()
    if not title or len(title) > 255:
        raise ApiError("Title must be 1-255 characters.", 422, "invalid_title")
    d.title = title
    db.session.commit()
    return jsonify({"document": d.to_dict(with_versions=True)})


def _delete_version_files(app, v):
    purge_vectors(app, v.id)
    try:
        version_path(app, v).unlink(missing_ok=True)
    except OSError:
        pass


@bp.delete("/<int:doc_id>")
@login_required
def delete_document(doc_id):
    d = owned_document(doc_id)
    app = current_app._get_current_object()
    for v in list(d.versions):
        _delete_version_files(app, v)
    from ..models import Analysis, Conversation
    Analysis.query.filter(Analysis.version_id.in_([v.id for v in d.versions])).delete(synchronize_session=False)
    Conversation.query.filter_by(document_id=d.id).delete(synchronize_session=False)
    db.session.delete(d)
    db.session.commit()
    return jsonify({"ok": True})


@bp.post("/<int:doc_id>/versions")
@login_required
def upload_version(doc_id):
    d = owned_document(doc_id)
    v = _new_version(d, _save_upload(g.user.id))
    d.updated_at = utcnow()
    db.session.commit()
    start_processing(current_app._get_current_object(), v.id)
    db.session.expire_all()
    return jsonify({"document": d.to_dict(with_versions=True), "version": v.to_dict()}), 202


@bp.get("/<int:doc_id>/versions/<int:vid>")
@login_required
def get_version(doc_id, vid):
    _, v = owned_version(doc_id, vid)
    return jsonify({"version": v.to_dict()})


@bp.delete("/<int:doc_id>/versions/<int:vid>")
@login_required
def delete_version(doc_id, vid):
    d, v = owned_version(doc_id, vid)
    if len(d.versions) == 1:
        raise ApiError("This is the only version. Delete the whole document instead.", 409, "last_version")
    from ..models import Analysis
    _delete_version_files(current_app._get_current_object(), v)
    Analysis.query.filter_by(version_id=v.id).delete(synchronize_session=False)
    db.session.delete(v)
    db.session.commit()
    db.session.expire_all()
    return jsonify({"document": d.to_dict(with_versions=True)})


@bp.post("/<int:doc_id>/versions/<int:vid>/reprocess")
@login_required
def reprocess(doc_id, vid):
    _, v = owned_version(doc_id, vid)
    if v.status in ("queued", "extracting", "chunking", "embedding"):
        raise ApiError("This version is already being processed.", 409, "busy")
    if not version_path(current_app, v).exists():
        raise ApiError("The original file is missing from storage.", 410, "file_missing")
    v.status, v.progress, v.error = "queued", 0, None
    db.session.commit()
    start_processing(current_app._get_current_object(), v.id)
    db.session.expire_all()
    return jsonify({"version": v.to_dict()}), 202


@bp.get("/<int:doc_id>/versions/<int:vid>/text")
@login_required
def version_text(doc_id, vid):
    _, v = owned_version(doc_id, vid)
    if v.text is None:
        raise ApiError("Text is not available yet.", 409, "not_ready")
    pages = v.text.split(extraction.PAGE_SEP)
    return jsonify({"version_id": v.id, "paged": v.file_type == "pdf",
                    "pages": [{"page": i + 1, "text": t} for i, t in enumerate(pages)],
                    "char_count": len(v.text)})


@bp.get("/<int:doc_id>/versions/<int:vid>/chunks")
@login_required
def version_chunks(doc_id, vid):
    _, v = owned_version(doc_id, vid)
    page, per = paging(default=20, maximum=100)
    q = Chunk.query.filter_by(version_id=v.id, user_id=g.user.id)
    if request.args.get("pdf_page"):
        try:
            q = q.filter_by(page=int(request.args["pdf_page"]))
        except ValueError:
            raise ApiError("pdf_page must be an integer.", 400, "invalid_params") from None
    total = q.count()
    items = q.order_by(Chunk.idx).offset((page - 1) * per).limit(per).all()
    return jsonify({"items": [c.to_dict() for c in items], "total": total, "page": page, "per_page": per,
                    "chunk_size": current_app.config["CHUNK_SIZE"],
                    "chunk_overlap": current_app.config["CHUNK_OVERLAP"]})


@bp.get("/<int:doc_id>/versions/<int:vid>/file")
@login_required
def download(doc_id, vid):
    _, v = owned_version(doc_id, vid)
    p = version_path(current_app, v)
    if not p.exists():
        raise NotFound("File")
    return send_file(p, as_attachment=True, download_name=v.filename)


