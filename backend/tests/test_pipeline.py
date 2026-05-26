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


def test_update_entry_edits_text_and_reembeds(fake_provider):
    """Editing the body updates the row and refreshes its single vector."""
    from app import db
    from app.ingestion import pipeline

    entry_id = pipeline.create_pending(
        kind="text", text="original", uploads=None, hint=None, occurred_at=None
    )
    asyncio.run(pipeline.process_entry(entry_id))

    updated = asyncio.run(
        pipeline.update_entry(
            entry_id, title="New Title", body="rewritten", occurred_at="2020-01-02T03:04:05"
        )
    )
    assert updated["title"] == "New Title"
    assert updated["body"] == "rewritten"
    assert updated["occurred_at"] == "2020-01-02T03:04:05"

    # Still exactly one vector row (re-embed deletes then re-inserts, not duplicates).
    n = db.get_conn().execute(
        "SELECT COUNT(*) AS n FROM entries_vec WHERE entry_id = ?", (entry_id,)
    ).fetchone()["n"]
    assert n == 1

    # FTS reflects the new body (trigger-driven), so search can find it.
    hit = db.get_conn().execute(
        "SELECT rowid FROM entries_fts WHERE entries_fts MATCH 'rewritten'"
    ).fetchone()
    assert hit["rowid"] == entry_id


def test_reembed_triggers_on_title_or_body_only(fake_provider, monkeypatch):
    """The embedding text includes the title, so a title-only edit must also
    re-embed; favorite/tag-only edits must not."""
    from app.ingestion import pipeline

    entry_id = pipeline.create_pending(
        kind="text", text="original", uploads=None, hint=None, occurred_at=None
    )
    asyncio.run(pipeline.process_entry(entry_id))

    calls: list[int] = []

    async def spy(eid):
        calls.append(eid)
        return True

    monkeypatch.setattr(pipeline, "reembed_entry", spy)

    # Title-only edit → re-embeds.
    asyncio.run(pipeline.update_entry(entry_id, title="New Title"))
    assert calls == [entry_id]

    # Favorite / tags only → no re-embed.
    asyncio.run(pipeline.update_entry(entry_id, favorite=True, tags=["x"]))
    assert calls == [entry_id]

    # Body edit → re-embeds again.
    asyncio.run(pipeline.update_entry(entry_id, body="changed"))
    assert calls == [entry_id, entry_id]


def test_update_entry_rejects_blank_body(fake_provider):
    from app.ingestion import pipeline

    entry_id = pipeline.create_pending(
        kind="text", text="keep me", uploads=None, hint=None, occurred_at=None
    )
    asyncio.run(pipeline.process_entry(entry_id))

    with pytest.raises(ValueError):
        asyncio.run(pipeline.update_entry(entry_id, body="   "))


def test_update_entry_blocked_while_processing(fake_provider):
    """A queued (not-yet-done) entry can't be edited."""
    from app.ingestion import pipeline

    entry_id = pipeline.create_pending(
        kind="text", text="pending", uploads=None, hint=None, occurred_at=None
    )  # left in 'queued' — process_entry not run

    with pytest.raises(ValueError):
        asyncio.run(pipeline.update_entry(entry_id, body="nope"))
