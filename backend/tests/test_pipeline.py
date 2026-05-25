"""Ingestion pipeline: a capture goes queued → done, with vectors + status."""

from __future__ import annotations

import asyncio
import json

import pytest


class FakeProvider:
    embedding_dim = 8

    async def describe_image(self, path, hint=None):
        return "a description"

    async def transcribe_audio(self, path):
        return "a transcript"

    async def summarize_title(self, body):
        return "Generated Title"

    async def embed(self, text):
        return [0.1] * 8


@pytest.fixture
def fake_provider(monkeypatch):
    from app.ingestion import pipeline

    fake = FakeProvider()
    monkeypatch.setattr(pipeline, "get_provider", lambda: fake)
    return fake


def test_text_entry_full_flow(fake_provider):
    from app import db
    from app.ingestion import pipeline

    entry_id = pipeline.create_pending(
        kind="text", text="hello world", uploads=None, hint=None, occurred_at=None
    )
    assert pipeline.fetch_entry(entry_id)["status"] == "queued"

    asyncio.run(pipeline.process_entry(entry_id))

    row = pipeline.fetch_entry(entry_id)
    assert row["status"] == "done"
    assert row["title"] == "Generated Title"
    assert row["body"] == "hello world"

    # The embedding dim is locked and a vector row exists.
    assert db.get_embedding_dim() == 8
    n = db.get_conn().execute(
        "SELECT COUNT(*) AS n FROM entries_vec WHERE entry_id = ?", (entry_id,)
    ).fetchone()["n"]
    assert n == 1

    # Internal bookkeeping is scrubbed from the stored meta.
    meta = json.loads(row["meta_json"]) if row["meta_json"] else {}
    assert "_pending" not in meta


def test_process_entry_marks_error_on_provider_failure(monkeypatch):
    from app.ingestion import pipeline

    class Boom(FakeProvider):
        async def summarize_title(self, body):
            raise RuntimeError("ANTHROPIC_API_KEY is empty")

    monkeypatch.setattr(pipeline, "get_provider", lambda: Boom())

    entry_id = pipeline.create_pending(
        kind="text", text="x", uploads=None, hint=None, occurred_at=None
    )
    asyncio.run(pipeline.process_entry(entry_id))

    row = pipeline.fetch_entry(entry_id)
    assert row["status"] == "error"
    meta = json.loads(row["meta_json"])
    assert "ANTHROPIC_API_KEY is empty" in meta["error"]


def test_multi_image_entry_is_one_record(fake_provider):
    """Several images in one capture form a single entry, described per-image."""
    from app.ingestion import pipeline

    entry_id = pipeline.create_pending(
        kind="image",
        text="my note",
        uploads=[(b"fake-png-a", ".png"), (b"fake-png-b", ".png")],
        hint=None,
        occurred_at=None,
    )

    row = pipeline.fetch_entry(entry_id)
    meta = json.loads(row["meta_json"])
    # All files recorded under meta['images']; source_path keeps the first.
    assert len(meta["images"]) == 2
    assert row["source_path"] == meta["images"][0]["path"]

    asyncio.run(pipeline.process_entry(entry_id))

    row = pipeline.fetch_entry(entry_id)
    assert row["status"] == "done"
    # Per-image descriptions are combined, and the user's note is preserved.
    assert "[Image 1]" in row["body"]
    assert "[Image 2]" in row["body"]
    assert row["body"].startswith("my note")


def test_create_pending_rejects_blank_text(fake_provider):
    from app.ingestion import pipeline

    with pytest.raises(ValueError):
        pipeline.create_pending(
            kind="text", text="   ", uploads=None, hint=None, occurred_at=None
        )
