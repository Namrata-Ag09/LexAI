import json
from datetime import datetime, timezone

from .extensions import db


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt):
    return dt.isoformat() + "Z" if dt else None


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False, default="")
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def to_dict(self):
        return {"id": self.id, "email": self.email, "name": self.name, "created_at": iso(self.created_at)}


class Document(db.Model):
    __tablename__ = "documents"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    versions = db.relationship("Version", backref="document", cascade="all, delete-orphan",
                               order_by="Version.version_number")

    @property
    def latest(self):
        return self.versions[-1] if self.versions else None

    def to_dict(self, with_versions=False):
        d = {"id": self.id, "title": self.title, "created_at": iso(self.created_at),
             "updated_at": iso(self.updated_at),
             "latest_version": self.latest.to_dict() if self.latest else None,
             "version_count": len(self.versions)}
        if with_versions:
            d["versions"] = [v.to_dict() for v in reversed(self.versions)]
        return d


class Version(db.Model):
    __tablename__ = "versions"
    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = db.Column(db.Integer, nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    stored_name = db.Column(db.String(255), nullable=False)
    file_type = db.Column(db.String(10), nullable=False)
    size_bytes = db.Column(db.Integer, nullable=False)
    sha256 = db.Column(db.String(64), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="queued")
    progress = db.Column(db.Integer, nullable=False, default=0)
    error = db.Column(db.Text)
    page_count = db.Column(db.Integer)
    ocr_used = db.Column(db.Boolean, default=False, nullable=False)
    warnings = db.Column(db.Text)  # JSON list
    text = db.Column(db.Text)  # cleaned text; pages separated by \f
    chunk_count = db.Column(db.Integer, default=0, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    processed_at = db.Column(db.DateTime)
    chunks = db.relationship("Chunk", backref="version", cascade="all, delete-orphan", order_by="Chunk.idx")

    def warning_list(self):
        return json.loads(self.warnings) if self.warnings else []

    def to_dict(self):
        return {"id": self.id, "document_id": self.document_id, "version_number": self.version_number,
                "filename": self.filename, "file_type": self.file_type, "size_bytes": self.size_bytes,
                "status": self.status, "progress": self.progress, "error": self.error,
                "page_count": self.page_count, "ocr_used": self.ocr_used, "warnings": self.warning_list(),
                "chunk_count": self.chunk_count, "created_at": iso(self.created_at),
                "processed_at": iso(self.processed_at)}


class Chunk(db.Model):
    __tablename__ = "chunks"
    id = db.Column(db.Integer, primary_key=True)
    version_id = db.Column(db.Integer, db.ForeignKey("versions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    idx = db.Column(db.Integer, nullable=False)
    page = db.Column(db.Integer)  # None for DOCX
    text = db.Column(db.Text, nullable=False)

    def to_dict(self, with_text=True):
        d = {"id": self.id, "version_id": self.version_id, "index": self.idx, "page": self.page,
             "char_count": len(self.text)}
        if with_text:
            d["text"] = self.text
        return d


class Conversation(db.Model):
    __tablename__ = "conversations"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    title = db.Column(db.String(200), nullable=False, default="New conversation")
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    messages = db.relationship("Message", backref="conversation", cascade="all, delete-orphan",
                               order_by="Message.id")

    def to_dict(self, with_messages=False):
        d = {"id": self.id, "document_id": self.document_id, "title": self.title,
             "created_at": iso(self.created_at), "updated_at": iso(self.updated_at)}
        if with_messages:
            d["messages"] = [m.to_dict() for m in self.messages]
        return d


class Message(db.Model):
    __tablename__ = "messages"
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey("conversations.id", ondelete="CASCADE"),
                                nullable=False, index=True)
    role = db.Column(db.String(12), nullable=False)
    content = db.Column(db.Text, nullable=False)
    meta = db.Column(db.Text)  # JSON: citations, sufficient, sources
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def to_dict(self):
        meta = json.loads(self.meta) if self.meta else {}
        return {"id": self.id, "role": self.role, "content": self.content,
                "citations": meta.get("citations", []), "sufficient": meta.get("sufficient"),
                "sources": meta.get("sources", []), "created_at": iso(self.created_at)}


class Analysis(db.Model):
    __tablename__ = "analyses"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    version_id = db.Column(db.Integer, db.ForeignKey("versions.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = db.Column(db.String(20), nullable=False)
    result = db.Column(db.Text, nullable=False)
    model = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def to_dict(self):
        return {"id": self.id, "version_id": self.version_id, "kind": self.kind,
                "result": json.loads(self.result), "model": self.model, "created_at": iso(self.created_at)}
