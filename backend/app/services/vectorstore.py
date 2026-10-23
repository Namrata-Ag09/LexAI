"""Persistent ChromaDB wrapper."""
import re

import chromadb
from chromadb.config import Settings


def collection_name(model, dim):
    return ("lexai_" + re.sub(r"[^a-zA-Z0-9]+", "_", model).strip("_") + f"_{dim}")[:120]


def _where(conds):
    conds = [c for c in conds if c]
    if not conds:
        return None
    return conds[0] if len(conds) == 1 else {"$and": conds}


class VectorStore:
    def __init__(self, path, name):
        self.client = chromadb.PersistentClient(path=str(path), settings=Settings(anonymized_telemetry=False))
        self.col = self.client.get_or_create_collection(name, metadata={"hnsw:space": "cosine"})

    def count(self):
        return self.col.count()

    def add(self, ids, embeddings, documents, metadatas):
        for i in range(0, len(ids), 100):
            s = slice(i, i + 100)
            self.col.upsert(ids=ids[s], embeddings=embeddings[s], documents=documents[s], metadatas=metadatas[s])

    def query(self, embedding, n, user_id, version_ids):
        total = self.col.count()
        if total == 0 or not version_ids:
            return []
        where = _where([{"user_id": user_id}, {"version_id": {"$in": list(version_ids)}}])
        res = self.col.query(query_embeddings=[embedding], n_results=min(n, total), where=where)
        return [{"id": i, "distance": d, "metadata": m}
                for i, d, m in zip(res["ids"][0], res["distances"][0], res["metadatas"][0], strict=True)]

    def delete_version(self, version_id):
        self.col.delete(where={"version_id": version_id})

    def delete_ids(self, ids):
        if ids:
            self.col.delete(ids=ids)


def get_store(app):
    from .ai import ai_signature

    model, dim = ai_signature(app)
    name = collection_name(model, dim)
    stores = app.extensions.setdefault("lexai_stores", {})
    key = (app.config["CHROMA_DIR"], name)
    if key not in stores:
        stores[key] = VectorStore(app.config["CHROMA_DIR"], name)
    return stores[key]
