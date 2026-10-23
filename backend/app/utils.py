import functools
import re

from flask import g, request, session

from .errors import ApiError, NotFound
from .extensions import db
from .models import Document, User, Version

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("Expected a JSON object in the request body.", 400, "invalid_json")
    return data


def login_required(fn):
    @functools.wraps(fn)
    def wrapper(*a, **kw):
        uid = session.get("uid")
        user = db.session.get(User, uid) if uid else None
        if user is None:
            raise ApiError("Please sign in to continue.", 401, "unauthenticated")
        g.user = user
        return fn(*a, **kw)
    return wrapper


def paging(default=20, maximum=100):
    try:
        page = max(1, int(request.args.get("page", 1)))
        per = min(maximum, max(1, int(request.args.get("per_page", default))))
    except ValueError:
        raise ApiError("page and per_page must be integers.", 400, "invalid_params") from None
    return page, per


def owned_document(doc_id):
    d = db.session.get(Document, doc_id)
    if d is None or d.user_id != g.user.id:
        raise NotFound("Document")
    return d


def owned_version(doc_id, version_id):
    d = owned_document(doc_id)
    v = db.session.get(Version, version_id)
    if v is None or v.document_id != d.id or v.user_id != g.user.id:
        raise NotFound("Version")
    return d, v
