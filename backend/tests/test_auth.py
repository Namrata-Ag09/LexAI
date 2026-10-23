from conftest import Api, _make


def test_register_login_logout_me(app):
    a = Api(app)
    assert a.get("/api/auth/me").status_code == 401
    a.register("bob@example.com")
    assert a.get("/api/auth/me").j["user"]["email"] == "bob@example.com"
    assert a.post("/api/auth/logout").status_code == 200
    assert a.get("/api/auth/me").status_code == 401
    r = a.post("/api/auth/login", {"email": "bob@example.com", "password": "Passw0rd-long"})
    assert r.status_code == 200 and r.j["user"]["name"] == "Alice"
    assert a.get("/api/auth/me").status_code == 200


def test_invalid_credentials_and_validation(app):
    a = Api(app)
    a.register("c@example.com")
    assert a.post("/api/auth/login", {"email": "c@example.com", "password": "nope"}).status_code == 401
    assert a.post("/api/auth/login", {"email": "none@example.com", "password": "x"}).status_code == 401
    assert a.post("/api/auth/register", {"email": "bad", "password": "Passw0rd-long"}).status_code == 422
    assert a.post("/api/auth/register", {"email": "d@example.com", "password": "short1"}).status_code == 422
    assert a.post("/api/auth/register", {"email": "d@example.com", "password": "onlyletterslong"}).status_code == 422
    assert a.post("/api/auth/register", {"email": "C@example.com", "password": "Passw0rd-long"}).status_code == 409


def test_csrf_required(app):
    c = app.test_client()
    r = c.post("/api/auth/register", json={"email": "x@example.com", "password": "Passw0rd-long"})
    assert r.status_code == 403 and r.get_json()["error"]["code"] == "csrf_failed"
    r = c.post("/api/auth/register", json={"email": "x@example.com", "password": "Passw0rd-long"},
               headers={"X-CSRF-Token": "forged"})
    assert r.status_code == 403


def test_password_is_hashed_and_profile_and_change(api, app):
    from app.models import User
    with app.app_context():
        u = User.query.first()
        assert "Passw0rd" not in u.password_hash and u.password_hash.startswith(("scrypt", "pbkdf2"))
    assert api.patch("/api/auth/me", {"name": "Alicia"}).j["user"]["name"] == "Alicia"
    assert api.post("/api/auth/change-password", {"current_password": "bad", "new_password": "NewPassw0rd-1"}).status_code == 403
    assert api.post("/api/auth/change-password", {"current_password": "Passw0rd-long", "new_password": "weak"}).status_code == 422
    assert api.post("/api/auth/change-password", {"current_password": "Passw0rd-long", "new_password": "NewPassw0rd-1"}).status_code == 200
    api.post("/api/auth/logout")
    assert api.post("/api/auth/login", {"email": "a@example.com", "password": "Passw0rd-long"}).status_code == 401
    assert api.post("/api/auth/login", {"email": "a@example.com", "password": "NewPassw0rd-1"}).status_code == 200


def test_security_headers(api):
    r = api.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]


def test_cors_only_for_allowed_origin(app):
    c = app.test_client()
    ok = c.get("/api/health", headers={"Origin": "http://localhost:5173"})
    bad = c.get("/api/health", headers={"Origin": "http://evil.example"})
    assert ok.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173"
    assert "Access-Control-Allow-Origin" not in bad.headers


def test_login_rate_limit(tmp_path):
    app = _make(tmp_path, RATELIMIT_ENABLED=True)
    a = Api(app)
    codes = [a.post("/api/auth/login", {"email": "z@example.com", "password": "x"}).status_code for _ in range(12)]
    assert 429 in codes
