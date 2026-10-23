import io
import os

import pytest
from conftest import Api, make_docx, make_pdf

from app.models import Chunk
from app.services import extraction
from app.services.chunking import chunk_pages, chunk_text


def test_pdf_upload_extract_chunk(api, doc, app):
    vid = doc["latest_version"]["id"]
    v = api.get(f"/api/documents/{doc['id']}/versions/{vid}").j["version"]
    assert v["status"] == "ready" and v["progress"] == 100 and v["page_count"] == 2 and v["chunk_count"] >= 2
    text = api.get(f"/api/documents/{doc['id']}/versions/{vid}/text").j
    assert text["paged"] and len(text["pages"]) == 2 and "Indemnity" in text["pages"][1]["text"]
    chunks = api.get(f"/api/documents/{doc['id']}/versions/{vid}/chunks").j
    assert chunks["total"] == v["chunk_count"] and {c["page"] for c in chunks["items"]} == {1, 2}
    only2 = api.get(f"/api/documents/{doc['id']}/versions/{vid}/chunks?pdf_page=2").j
    assert all(c["page"] == 2 for c in only2["items"])
    with app.app_context():
        from app.services.vectorstore import get_store
        assert get_store(app).count() == v["chunk_count"]


def test_docx_upload(api):
    data = make_docx(["Payment Terms", "The Customer shall pay all invoices within thirty days."])
    r = api.upload(data, "terms.docx")
    assert r.status_code == 202
    d = r.j["document"]
    v = d["latest_version"]
    assert v["status"] == "ready" and v["page_count"] is None
    t = api.get(f"/api/documents/{d['id']}/versions/{v['id']}/text").j
    assert not t["paged"] and "Net 30 days" in t["pages"][0]["text"]


@pytest.mark.parametrize("name,data,code", [
    ("notes.txt", b"hello world", 415),
    ("fake.pdf", b"this is not a pdf at all", 422),
    ("fake.docx", b"PK\x03\x04 not really a zip", 422),
    ("empty.pdf", b"", 400),
])
def test_invalid_uploads(api, name, data, code, app):
    r = api.upload(data, name)
    assert r.status_code == code, r.j
    folder = os.path.join(app.config["UPLOAD_DIR"])
    assert not any(f for _, _, fs in os.walk(folder) for f in fs)  # nothing left behind
    assert api.get("/api/documents").j["total"] == 0


def test_too_large(tmp_path):
    from conftest import _make
    app = _make(tmp_path, MAX_UPLOAD_MB=1, MAX_CONTENT_LENGTH=2 * 1024 * 1024)
    a = Api(app)
    a.register()
    r = a.upload(b"%PDF-1.4" + b"0" * (1024 * 1024 + 10), "big.pdf")
    assert r.status_code == 413


def test_no_api_key_extracts_but_ai_disabled(app_no_key, pdf_bytes):
    a = Api(app_no_key)
    a.register()
    d = a.upload(pdf_bytes).j["document"]
    v = d["latest_version"]
    assert v["status"] == "extracted" and "GEMINI_API_KEY" in v["error"] and v["chunk_count"] > 0
    assert a.get(f"/api/documents/{d['id']}/versions/{v['id']}/text").status_code == 200
    r = a.get("/api/search?q=termination")
    assert r.status_code == 503 and r.j["error"]["code"] == "ai_not_configured"
    c = a.post("/api/conversations", {"document_id": d["id"]}).j["conversation"]
    assert a.post(f"/api/conversations/{c['id']}/messages", {"content": "hi?"}).status_code == 503
    assert a.post(f"/api/documents/{d['id']}/versions/{v['id']}/analyses/summary").status_code == 503
    assert a.get("/api/health").j["checks"]["ai"]["configured"] is False


def test_embedding_failure_keeps_text_and_reprocess_recovers(api, app, fake, pdf_bytes):
    fake.fail_embed = True
    d = api.upload(pdf_bytes).j["document"]
    v = d["latest_version"]
    assert v["status"] == "extracted" and "indexing failed" in v["error"]
    with app.app_context():
        from app.services.vectorstore import get_store
        assert get_store(app).count() == 0
    fake.fail_embed = False
    r = api.post(f"/api/documents/{d['id']}/versions/{v['id']}/reprocess")
    assert r.status_code == 202 and r.j["version"]["status"] == "ready"


def test_versions_and_deletion_cleanup(api, doc, app, pdf_bytes):
    did = doc["id"]
    r = api.upload(make_pdf(["Version two text about renewal terms."]), "v2.pdf", url=f"/api/documents/{did}/versions")
    assert r.status_code == 202
    d = r.j["document"]
    assert d["version_count"] == 2 and d["latest_version"]["version_number"] == 2
    assert [v["version_number"] for v in d["versions"]] == [2, 1]
    from app.services.vectorstore import get_store
    with app.app_context():
        total = get_store(app).count()
        assert total >= 3
    v1 = d["versions"][1]["id"]
    assert api.delete(f"/api/documents/{did}/versions/{v1}").status_code == 200
    with app.app_context():
        assert get_store(app).count() < total
        assert Chunk.query.filter_by(version_id=v1).count() == 0
    last = d["versions"][0]["id"]
    assert api.delete(f"/api/documents/{did}/versions/{last}").status_code == 409
    assert api.delete(f"/api/documents/{did}").status_code == 200
    with app.app_context():
        assert get_store(app).count() == 0
        assert Chunk.query.count() == 0
    assert not any(f for _, _, fs in os.walk(app.config["UPLOAD_DIR"]) for f in fs)
    assert api.get(f"/api/documents/{did}").status_code == 404


def test_rename_list_and_download(api, doc):
    assert api.patch(f"/api/documents/{doc['id']}", {"title": "Renamed"}).j["document"]["title"] == "Renamed"
    assert api.patch(f"/api/documents/{doc['id']}", {"title": " "}).status_code == 422
    assert api.get("/api/documents?q=rename").j["total"] == 1
    assert api.get("/api/documents?q=zzz").j["total"] == 0
    r = api.get(f"/api/documents/{doc['id']}/versions/{doc['latest_version']['id']}/file")
    assert r.status_code == 200 and r.data.startswith(b"%PDF")


def test_cross_user_isolation(app, api, doc, api_factory):
    vid = doc["latest_version"]["id"]
    did = doc["id"]
    api.post("/api/auth/logout")
    b = api_factory(app)
    b.register("b@example.com")
    urls = [f"/api/documents/{did}", f"/api/documents/{did}/versions/{vid}",
            f"/api/documents/{did}/versions/{vid}/text", f"/api/documents/{did}/versions/{vid}/chunks",
            f"/api/documents/{did}/versions/{vid}/file", f"/api/documents/{did}/versions/{vid}/analyses"]
    for u in urls:
        assert b.get(u).status_code == 404, u
    assert b.patch(f"/api/documents/{did}", {"title": "hax"}).status_code == 404
    assert b.delete(f"/api/documents/{did}").status_code == 404
    assert b.post(f"/api/documents/{did}/versions/{vid}/reprocess").status_code == 404
    assert b.post(f"/api/documents/{did}/versions/{vid}/analyses/summary").status_code == 404
    assert b.post(f"/api/documents/{did}/versions", data={"file": (io.BytesIO(b"%PDF-1"), "x.pdf")},
                  content_type="multipart/form-data").status_code == 404
    assert b.get("/api/documents").j["total"] == 0
    assert b.get(f"/api/search?q=termination&document_id={did}").status_code == 404
    assert b.get("/api/search?q=termination").j["total"] == 0
    with app.app_context():
        cid = Chunk.query.first().id
    assert b.get(f"/api/chunks/{cid}").status_code == 404
    assert b.post("/api/conversations", {"document_id": did}).status_code == 404
    # and A still has full access afterwards
    api.post("/api/auth/login", {"email": "a@example.com", "password": "Passw0rd-long"})
    assert api.get(f"/api/documents/{did}").status_code == 200


def test_unauthenticated_access(app):
    a = Api(app)
    for u in ("/api/documents", "/api/search?q=abc", "/api/conversations", "/api/documents/1"):
        assert a.get(u).status_code == 401


# ---------- pure unit tests ----------
def test_clean_text():
    raw = "Ter-\nmination clause.\n\n\n1.1   The  parties\nagree\u00a0to this.\n(a) first item\n(b) second item\x00"
    out = extraction.clean_text(raw)
    assert "Termination clause." in out and "1.1 The parties agree to this." in out
    assert "\n(a) first item\n(b) second item" in out and "\x00" not in out and "  " not in out


def test_chunking_overlap_and_pages():
    text = " ".join(f"word{i}" for i in range(600))
    chunks = chunk_text(text, 300, 60)
    assert len(chunks) > 5 and all(len(c) <= 300 for c in chunks)
    assert chunks[0].split()[-1] in chunks[1]  # overlap carries content forward
    assert " ".join(chunks).count("word599") >= 1
    pages = chunk_pages(["alpha " * 100, "beta " * 100], True, 200, 40)
    assert {p["page"] for p in pages} == {1, 2}
    assert all(("alpha" in p["text"]) == (p["page"] == 1) for p in pages)
    assert all(p["page"] is None for p in chunk_pages(["x " * 200], False, 200, 20))
    with pytest.raises(ValueError):
        chunk_text("abc", 200, 200)


def test_ocr_detection_and_fallback(monkeypatch, app_no_key, tmp_path):
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("RGB", (1200, 400), "white")
    ImageDraw.Draw(img).text((40, 100), "INDEMNITY AGREEMENT SIGNED", fill="black", font=ImageFont.load_default(size=60))
    pdf = io.BytesIO()
    img.save(pdf, "PDF")
    scanned = pdf.getvalue()
    a = Api(app_no_key)
    a.register()
    # no tesseract -> clear failure, app still works
    monkeypatch.setattr(extraction, "tesseract_path", lambda cfg=None: None)
    ok, detail = extraction.ocr_status()
    assert not ok and "Tesseract" in detail
    v = a.upload(scanned).j["document"]["latest_version"]
    assert v["status"] == "failed" and "OCR is unavailable" in v["error"]
    assert a.get("/api/health").j["checks"]["ocr"]["ok"] is False
    monkeypatch.undo()
    if not extraction.ocr_status()[0]:
        pytest.skip("Tesseract not installed in this environment")
    v = a.upload(scanned).j["document"]["latest_version"]
    assert v["ocr_used"] is True and v["status"] in ("extracted", "ready")
    t = a.get(f"/api/documents/{a.get('/api/documents').j['items'][0]['id']}/versions/{v['id']}/text").j
    assert "INDEMNITY" in t["pages"][0]["text"].upper()


def test_migrations_create_schema_and_are_idempotent(app):
    from flask_migrate import upgrade
    from sqlalchemy import inspect

    from app import MIGRATIONS
    from app.extensions import db
    with app.app_context():
        names = set(inspect(db.engine).get_table_names())
        assert {"users", "documents", "versions", "chunks", "conversations", "messages", "analyses"} <= names
        upgrade(directory=str(MIGRATIONS))  # second run must be a no-op


def test_vector_persistence_across_restart(tmp_path, fake, pdf_bytes):
    from conftest import _make

    from app.services.vectorstore import get_store
    a1 = _make(tmp_path)
    a1.extensions["lexai_ai"] = fake
    c1 = Api(a1)
    c1.register()
    c1.upload(pdf_bytes)
    with a1.app_context():
        n = get_store(a1).count()
    assert n > 0
    a2 = _make(tmp_path)  # fresh app object, same data dir = restart
    a2.extensions["lexai_ai"] = fake
    c2 = Api(a2)
    assert c2.post("/api/auth/login", {"email": "a@example.com", "password": "Passw0rd-long"}).status_code == 200
    with a2.app_context():
        assert get_store(a2).count() == n
    assert c2.get("/api/search?q=terminate notice").j["total"] > 0


def test_interrupted_processing_is_recovered(tmp_path, fake, pdf_bytes):
    from conftest import _make

    from app.extensions import db
    from app.models import Version
    a = _make(tmp_path)
    a.extensions["lexai_ai"] = fake
    c = Api(a)
    c.register()
    c.upload(pdf_bytes)
    with a.app_context():
        Version.query.update({"status": "embedding"})
        db.session.commit()
    b = _make(tmp_path)
    with b.app_context():
        assert Version.query.first().status == "failed"
