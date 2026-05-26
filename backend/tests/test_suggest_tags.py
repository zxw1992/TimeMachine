"""AI tag suggestion: the reply parser and the ingestion integration."""

from __future__ import annotations

import asyncio
import json

from app.ai.base import parse_suggested_tags


def test_parse_handles_separators_and_noise():
    # Commas, fullwidth commas, the Chinese enumeration comma, and newlines.
    assert parse_suggested_tags("work, ideas，life、health\nmusic") == [
        "work",
        "ideas",
        "life",
        "health",
        "music",
    ]
    # Leading '#', numbering, quotes and bullets are stripped.
    assert parse_suggested_tags("1. #travel\n2) 'food'\n- 工作") == [
        "travel",
        "food",
        "工作",
    ]


def test_parse_dedupes_and_caps():
    assert parse_suggested_tags("a, A, a") == ["a"]  # case-insensitive dedupe
    out = parse_suggested_tags(",".join(f"t{i}" for i in range(20)))
    assert len(out) == 5  # MAX_SUGGESTED_TAGS


def test_parse_empty():
    assert parse_suggested_tags("") == []
    assert parse_suggested_tags("   ,  ,  ") == []


class TaggingProvider:
    embedding_dim = 8

    async def summarize_title(self, body):
        return "Title"

    async def suggest_tags(self, body):
        return ["alpha", "beta"]

    async def embed(self, text):
        return [0.1] * 8


def test_suggested_tags_land_in_meta(monkeypatch):
    from app.ingestion import pipeline

    monkeypatch.setattr(pipeline, "get_provider", lambda: TaggingProvider())
    eid = pipeline.create_pending(
        kind="text", text="hello", uploads=None, hint=None, occurred_at=None
    )
    asyncio.run(pipeline.process_entry(eid))

    row = pipeline.fetch_entry(eid)
    assert row["status"] == "done"
    meta = json.loads(row["meta_json"])
    assert meta["suggested_tags"] == ["alpha", "beta"]
    # Suggestions are NOT auto-applied as real tags.
    from app import db

    assert db.get_entry_tags(eid) == []


def test_toggle_off_skips_suggestion(monkeypatch):
    from app import config
    from app.ingestion import pipeline

    monkeypatch.setattr(pipeline, "get_provider", lambda: TaggingProvider())
    config.save_settings({"suggest_tags": False})

    eid = pipeline.create_pending(
        kind="text", text="hello", uploads=None, hint=None, occurred_at=None
    )
    asyncio.run(pipeline.process_entry(eid))

    row = pipeline.fetch_entry(eid)
    assert row["status"] == "done"
    meta = json.loads(row["meta_json"]) if row["meta_json"] else {}
    assert "suggested_tags" not in meta


def test_suggestion_failure_does_not_block_ingestion(monkeypatch):
    from app.ingestion import pipeline

    class Boom(TaggingProvider):
        async def suggest_tags(self, body):
            raise RuntimeError("model error")

    monkeypatch.setattr(pipeline, "get_provider", lambda: Boom())
    eid = pipeline.create_pending(
        kind="text", text="hi", uploads=None, hint=None, occurred_at=None
    )
    asyncio.run(pipeline.process_entry(eid))

    row = pipeline.fetch_entry(eid)
    assert row["status"] == "done"  # ingestion completes despite the failure
    meta = json.loads(row["meta_json"]) if row["meta_json"] else {}
    assert "suggested_tags" not in meta
