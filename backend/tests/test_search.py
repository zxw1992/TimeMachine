"""Semantic search: results come back ordered by similarity, with a floor."""

from __future__ import annotations

import asyncio

from app import db
from app.routes import search as search_route
from app.schemas import SearchRequest


def _insert(entry_id: int, body: str, vec: list[float]) -> None:
    conn = db.get_conn()
    conn.execute(
        "INSERT INTO entries(id, occurred_at, kind, title, body, status) "
        "VALUES (?, ?, 'text', ?, ?, 'done')",
        (entry_id, "2026-05-25T00:00:00", f"t{entry_id}", body),
    )
    conn.execute(
        "INSERT INTO entries_vec(entry_id, embedding) VALUES (?, ?)",
        (entry_id, db.serialize_vector(vec)),
    )
    conn.commit()


class QueryProvider:
    embedding_dim = 3

    async def embed(self, text):
        return [1.0, 0.0, 0.0]


def test_search_orders_by_similarity_and_applies_threshold(monkeypatch):
    db.ensure_vec_table(3)
    _insert(1, "exact", [1.0, 0.0, 0.0])    # distance 0      → score 1.00
    _insert(2, "close", [0.92, 0.39, 0.0])  # distance ~0.40  → score ~0.60
    _insert(3, "far", [0.0, 1.0, 0.0])      # distance ~1.41  → score ~-0.41 (filtered)

    monkeypatch.setattr(search_route, "get_provider", lambda: QueryProvider())
    resp = asyncio.run(search_route.search(SearchRequest(query="anything", top_k=10)))

    ids = [h.entry.id for h in resp.hits]
    assert ids == [1, 2]  # best-first; the far one is dropped by MIN_SCORE
    assert resp.hits[0].score >= resp.hits[1].score
    assert all(h.score >= search_route.MIN_SCORE for h in resp.hits)


def test_search_returns_empty_without_an_index(monkeypatch):
    monkeypatch.setattr(search_route, "get_provider", lambda: QueryProvider())
    resp = asyncio.run(search_route.search(SearchRequest(query="x")))
    assert resp.hits == []
