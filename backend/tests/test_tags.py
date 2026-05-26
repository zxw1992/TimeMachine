"""Tags & favorites: normalization, storage, counts, and orphan cleanup."""

from __future__ import annotations

import asyncio

import pytest


class FakeProvider:
    embedding_dim = 8

    async def summarize_title(self, body):
        return "T"

    async def embed(self, text):
        return [0.1] * 8


@pytest.fixture
def done_entry(monkeypatch):
    """A finished text entry whose id is returned."""
    from app.ingestion import pipeline

    monkeypatch.setattr(pipeline, "get_provider", lambda: FakeProvider())
    entry_id = pipeline.create_pending(
        kind="text", text="hello", uploads=None, hint=None, occurred_at=None
    )
    asyncio.run(pipeline.process_entry(entry_id))
    return entry_id


def test_normalize_tags_dedupes_trims_and_caps():
    from app import db

    out = db.normalize_tags(["  Work ", "work", "", "  ", "idea", "WORK"])
    # Case-insensitive dedupe keeps first casing; blanks dropped.
    assert out == ["Work", "idea"]
    # Count is capped.
    many = db.normalize_tags([f"t{i}" for i in range(50)])
    assert len(many) == 20


def test_set_and_get_entry_tags(done_entry):
    from app import db

    stored = db.set_entry_tags(done_entry, ["travel", "Japan", "japan"])
    assert stored == ["travel", "Japan"]  # duplicate folded
    assert db.get_entry_tags(done_entry) == ["Japan", "travel"]  # sorted, NOCASE


def test_set_entry_tags_replaces(done_entry):
    from app import db

    db.set_entry_tags(done_entry, ["a", "b"])
    db.set_entry_tags(done_entry, ["b", "c"])
    assert db.get_entry_tags(done_entry) == ["b", "c"]
    # "a" had no other reference, so it's purged from the dictionary.
    names = {t["name"] for t in db.list_all_tags()}
    assert names == {"b", "c"}


def test_list_all_tags_counts(monkeypatch):
    from app import db
    from app.ingestion import pipeline

    monkeypatch.setattr(pipeline, "get_provider", lambda: FakeProvider())
    ids = []
    for _ in range(3):
        i = pipeline.create_pending(
            kind="text", text="x", uploads=None, hint=None, occurred_at=None
        )
        asyncio.run(pipeline.process_entry(i))
        ids.append(i)
    db.set_entry_tags(ids[0], ["common"])
    db.set_entry_tags(ids[1], ["common", "rare"])
    db.set_entry_tags(ids[2], ["common"])

    tags = db.list_all_tags()
    assert tags[0] == {"name": "common", "count": 3}  # most-used first
    assert {"name": "rare", "count": 1} in tags


def test_favorite_toggle(done_entry):
    from app import db
    from app.ingestion import pipeline

    db.set_favorite(done_entry, True)
    assert pipeline.fetch_entry(done_entry)["favorite"] == 1
    db.set_favorite(done_entry, False)
    assert pipeline.fetch_entry(done_entry)["favorite"] == 0


def test_update_entry_sets_tags_and_favorite(done_entry):
    from app import db
    from app.ingestion import pipeline

    updated = asyncio.run(
        pipeline.update_entry(done_entry, tags=["x", "y"], favorite=True)
    )
    assert updated["favorite"] == 1
    assert db.get_entry_tags(done_entry) == ["x", "y"]


def test_tags_allowed_while_processing(monkeypatch):
    """tags/favorite don't require a finished entry; text edits do."""
    from app import db
    from app.ingestion import pipeline

    monkeypatch.setattr(pipeline, "get_provider", lambda: FakeProvider())
    entry_id = pipeline.create_pending(
        kind="text", text="pending", uploads=None, hint=None, occurred_at=None
    )  # left queued

    asyncio.run(pipeline.update_entry(entry_id, tags=["wip"], favorite=True))
    assert db.get_entry_tags(entry_id) == ["wip"]
    # But a text edit on the unfinished entry is rejected.
    with pytest.raises(ValueError):
        asyncio.run(pipeline.update_entry(entry_id, body="nope"))


def test_delete_entry_purges_orphan_tags(done_entry):
    from app import db
    from app.ingestion import pipeline

    db.set_entry_tags(done_entry, ["solo"])
    assert any(t["name"] == "solo" for t in db.list_all_tags())
    pipeline.delete_entry(done_entry)
    assert db.list_all_tags() == []
