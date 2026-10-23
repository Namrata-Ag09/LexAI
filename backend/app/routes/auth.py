import secrets

from flask import Blueprint, g, jsonify, session
from werkzeug.security import check_password_hash, generate_password_hash

from ..errors import ApiError
from ..extensions import db, limiter
from ..models import User
from ..utils import EMAIL_RE, body, login_required

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _csrf():
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(32)
    return session["csrf"]


def _check_password(app_cfg, pw):
    n = app_cfg["MIN_PASSWORD_LENGTH"]
    if len(pw) < n:
        raise ApiError(f"Password must be at least {n} characters.", 422, "weak_password")
    if len(pw) > 200 or not any(c.isalpha() for c in pw) or not any(c.isdigit() for c in pw):
        raise ApiError("Password must contain letters and numbers.", 422, "weak_password")


def _login(user):
    session.clear()
    session.permanent = True
    session["uid"] = user.id
    return _csrf()


@bp.get("/csrf")
def csrf():
    return jsonify({"csrf_token": _csrf()})


@bp.post("/register")
@limiter.limit("10/hour")
def register():
    from flask import current_app
    if not current_app.config["ALLOW_REGISTRATION"]:
        raise ApiError("Registration is disabled.", 403, "registration_disabled")
    d = body()
    email, name, pw = str(d.get("email", "")).strip().lower(), str(d.get("name", "")).strip()[:120], str(d.get("password", ""))
    if not EMAIL_RE.match(email) or len(email) > 255:
        raise ApiError("Enter a valid email address.", 422, "invalid_email")
    _check_password(current_app.config, pw)
    if User.query.filter_by(email=email).first():
        raise ApiError("An account with this email already exists.", 409, "email_taken")
    user = User(email=email, name=name or email.split("@")[0], password_hash=generate_password_hash(pw))
    db.session.add(user)
    db.session.commit()
    token = _login(user)
    return jsonify({"user": user.to_dict(), "csrf_token": token}), 201


@bp.post("/login")
@limiter.limit("10/minute")
def login():
    d = body()
    user = User.query.filter_by(email=str(d.get("email", "")).strip().lower()).first()
    pw = str(d.get("password", ""))
    # constant-ish behaviour for unknown users
    ok = check_password_hash(user.password_hash if user else generate_password_hash("x"), pw) and user
    if not ok:
        raise ApiError("Incorrect email or password.", 401, "invalid_credentials")
    token = _login(user)
    return jsonify({"user": user.to_dict(), "csrf_token": token})


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True, "csrf_token": _csrf()})


@bp.get("/me")
@login_required
def me():
    return jsonify({"user": g.user.to_dict()})


@bp.patch("/me")
@login_required
def update_me():
    d = body()
    if "name" in d:
        name = str(d["name"]).strip()
        if not name or len(name) > 120:
            raise ApiError("Name must be 1-120 characters.", 422, "invalid_name")
        g.user.name = name
    if "email" in d:
        email = str(d["email"]).strip().lower()
        if not EMAIL_RE.match(email):
            raise ApiError("Enter a valid email address.", 422, "invalid_email")
        other = User.query.filter_by(email=email).first()
        if other and other.id != g.user.id:
            raise ApiError("That email is already in use.", 409, "email_taken")
        g.user.email = email
    db.session.commit()
    return jsonify({"user": g.user.to_dict()})


@bp.post("/change-password")
@login_required
@limiter.limit("10/hour")
def change_password():
    from flask import current_app
    d = body()
    if not check_password_hash(g.user.password_hash, str(d.get("current_password", ""))):
        raise ApiError("Current password is incorrect.", 403, "invalid_credentials")
    new = str(d.get("new_password", ""))
    _check_password(current_app.config, new)
    g.user.password_hash = generate_password_hash(new)
    db.session.commit()
    token = _login(g.user)  # rotate session
    return jsonify({"ok": True, "csrf_token": token})
