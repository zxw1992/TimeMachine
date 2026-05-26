"""Export / import: backup round-trips losslessly and import de-duplicates."""

from __future__ import annotations

import io
import json
import zipfile

import pytest


class FakeProvider:
    embedding_dim = 8

    async def describe_image(self, path, hint=None):
        return "an image"

    async def summarize_title(self, body):
        return "Title"

    async def embed(self, text):
        return [0.1] * 8


@pytest.fixture
def seeded(monkeypatch):
    """Two entries: a tagged + favorited text note and an image with a file."""
    import asyncio

    from app import db, transfer
    from app.ingestion import pipeline

    monkeypatch.setattr(pipeline, "get_provider", lambda: FakeProvider())

    t = pipeline.create_pending(
        kind="text", text="a memory", uploads=None, hint=None, occurred_at="2024-01-01T08:00:00"
    )
    asyncio.run(pipeline.process_entry(t))
    db.set_entry_tags(t, ["life", "note"])
    db.set_favorite(t, True)

    img = pipeline.create_pending(
        kind="image",
        text="caption",
        uploads=[(b"PNGDATA", ".png")],
        hint=None,
        occurred_at="2024-01-02T09:00:00",
    )
    asyncio.run(pipeline.process_entry(img))

    return transfer


def test_backup_zip_has_manifest_and_media(seeded):
    data = seeded.build_backup_zip()
    zf = zipfile.ZipFile(io.BytesIO(data))
    names = zf.namelist()
    assert "timemachine.json" in names
    # The image's uploaded file is bundled under media/uploads/...
    assert any(n.startswith("media/uploads/") for n in names)

    manifest = json.loads(zf.read("timemachine.json"))
    assert manifest["format"] == "aitimemachine-backup"
    assert manifest["entry_count"] == 2
    text_entry = next(e for e in manifest["entries"] if e["kind"] == "text")
    assert text_entry["favorite"] is True
    assert sorted(text_entry["tags"]) == ["life", "note"]


def test_round_trip_restores_everything(seeded):
    from app import db
    from app.ingestion import pipeline

    backup = seeded.build_backup_zip()

    # Wipe the timeline (also removes the image file on disk).
    for r in db.get_conn().execute("SELECT id FROM entries").fetchall():
        pipeline.delete_entry(r["id"])
    assert db.get_conn().execute("SELECT COUNT(*) c FROM entries").fetchone()["c"] == 0

    result = seeded.import_backup(backup)
    assert result["imported"] == 2 and result["skipped"] == 0

    rows = db.get_conn().execute(
        "SELECT id, kind, favorite, source_path FROM entries ORDER BY occurred_at"
    ).fetchall()
    assert [r["kind"] for r in rows] == ["text", "image"]

    text_row = rows[0]
    assert text_row["favorite"] == 1
    assert db.get_entry_tags(text_row["id"]) == ["life", "note"]

    # The image's media file was written back to its original relative path.
    img_row = rows[1]
    restored = db.get_settings().data_path / img_row["source_path"]
    assert restored.is_file() and restored.read_bytes() == b"PNGDATA"


def test_import_is_idempotent(seeded):
    from app import db

    backup = seeded.build_backup_zip()
    first = seeded.import_backup(backup)  # entries already exist → all skipped
    assert first["imported"] == 0 and first["skipped"] == 2
    assert db.get_conn().execute("SELECT COUNT(*) c FROM entries").fetchone()["c"] == 2


def test_import_rejects_non_backup(seeded):
    # A zip without the manifest is rejected.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("notes.txt", "hi")
    with pytest.raises(ValueError):
        seeded.import_backup(buf.getvalue())

    # Not even a zip.
    with pytest.raises(ValueError):
        seeded.import_backup(b"this is not a zip")


def test_markdown_export_groups_by_day(seeded):
    data = seeded.build_markdown_zip()
    zf = zipfile.ZipFile(io.BytesIO(data))
    md = zf.read("timemachine.md").decode()
    assert "## 2024-01-01" in md
    assert "## 2024-01-02" in md
    assert "`#life`" in md
    assert "![](media/uploads/" in md  # image reference
