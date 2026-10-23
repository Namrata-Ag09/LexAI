import json
import re

from flask import Blueprint, current_app, g, jsonify, request

from ..errors import ApiError, NotFound
from ..extensions import db, limiter
from ..models import Analysis, Chunk, Conversation, Message
from ..services import rag
from ..services.analysis import run_analysis
from ..utils import body, login_required, owned_document, owned_version, paging

bp = Blueprint("ai", __name__, url_prefix="/api")
AI_LIMIT = "40/minute"


@bp.get("/search")
@login_required
@limiter.limit(AI_LIMIT)
def search():
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        raise ApiError("Enter at least 2 characters to search.", 422, "invalid_query")
    if len(q) > 500:
        raise ApiError("Search query is too long.", 422, "invalid_query")
    page, per = paging(default=10, maximum=50)
    doc_id = request.args.get("document_id", type=int)
    if doc_id:
        owned_document(doc_id)
    scope = "all" if request.args.get("scope") == "all" else "current"
    hits = rag.retrieve(current_app._get_current_object(), g.user.id, q, doc_id, scope,
                        min(100, page * per))
    total = len(hits)
    window = hits[(page - 1) * per: page * per]
    terms = sorted({t.lower() for t in re.findall(r"[\w'-]{3,}", q)})
    return jsonify({"query": q, "terms": terms, "total": total, "page": page, "per_page": per,
                    "results": [rag.passage(c, s) for c, s in window]})


@bp.get("/chunks/<int:chunk_id>")
@login_required
def chunk_detail(chunk_id):
    c = db.session.get(Chunk, chunk_id)
    if c is None or c.user_id != g.user.id:
        raise NotFound("Passage")
    return jsonify({"passage": rag.passage(c)})


# ---------------- analysis ----------------
@bp.get("/documents/<int:doc_id>/versions/<int:vid>/analyses")
@login_required
def list_analyses(doc_id, vid):
    _, v = owned_version(doc_id, vid)
    q = Analysis.query.filter_by(version_id=v.id, user_id=g.user.id)
    kind = request.args.get("kind")
    if kind:
        q = q.filter_by(kind=kind)
    rows = q.order_by(Analysis.id.desc()).limit(30).all()
    return jsonify({"items": [r.to_dict() for r in rows]})


@bp.post("/documents/<int:doc_id>/versions/<int:vid>/analyses/<kind>")
@login_required
@limiter.limit("15/minute")
def create_analysis(doc_id, vid, kind):
    if kind not in ("summary", "clauses", "risks"):
        raise NotFound("Analysis type")
    _, v = owned_version(doc_id, vid)
    if v.status not in ("ready", "extracted") or not v.chunk_count:
        raise ApiError("This document version is not ready for analysis yet.", 409, "not_ready")
    row = run_analysis(current_app._get_current_object(), g.user.id, v, kind)
    return jsonify({"analysis": row.to_dict()}), 201


# ---------------- chat ----------------
@bp.get("/conversations")
@login_required
def list_conversations():
    q = Conversation.query.filter_by(user_id=g.user.id)
    doc_id = request.args.get("document_id", type=int)
    if doc_id:
        q = q.filter_by(document_id=doc_id)
    rows = q.order_by(Conversation.updated_at.desc()).limit(50).all()
    return jsonify({"items": [c.to_dict() for c in rows]})


@bp.post("/conversations")
@login_required
def create_conversation():
    d = request.get_json(silent=True) or {}
    doc_id = d.get("document_id")
    if doc_id is not None:
        owned_document(int(doc_id))
    c = Conversation(user_id=g.user.id, document_id=doc_id)
    db.session.add(c)
    db.session.commit()
    return jsonify({"conversation": c.to_dict(with_messages=True)}), 201


def _owned_conv(cid):
    c = rag.owned_conversation(g.user.id, cid)
    if c is None:
        raise NotFound("Conversation")
    return c


@bp.get("/conversations/<int:cid>")
@login_required
def get_conversation(cid):
    return jsonify({"conversation": _owned_conv(cid).to_dict(with_messages=True)})


@bp.delete("/conversations/<int:cid>")
@login_required
def delete_conversation(cid):
    db.session.delete(_owned_conv(cid))
    db.session.commit()
    return jsonify({"ok": True})


@bp.post("/conversations/<int:cid>/messages")
@login_required
@limiter.limit(AI_LIMIT)
def send_message(cid):
    conv = _owned_conv(cid)
    text = str(body().get("content", "")).strip()
    if not text:
        raise ApiError("Type a question first.", 422, "empty_message")
    if len(text) > 2000:
        raise ApiError("Questions are limited to 2000 characters.", 422, "message_too_long")
    # Run the AI first so a provider failure doesn't leave an orphaned question.
    result = rag.answer_question(current_app._get_current_object(), g.user.id, text, conv, conv.document_id)
    user_msg = Message(conversation_id=conv.id, role="user", content=text)
    bot = Message(conversation_id=conv.id, role="assistant", content=result["answer"],
                  meta=json.dumps({"citations": result["citations"], "sufficient": result["sufficient"],
                                   "sources": result["sources"]}))
    db.session.add_all([user_msg, bot])
    if conv.title == "New conversation":
        conv.title = text[:80]
    db.session.commit()
    return jsonify({"user_message": user_msg.to_dict(), "assistant_message": bot.to_dict(),
                    "disclaimer": result["disclaimer"]}), 201
