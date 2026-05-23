from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path

from PIL import Image

from ..ai.registry import get_provider
from ..config import get_settings
from ..db import ensure_vec_table, get_conn, serialize_vector, transaction


def _save_upload(file_bytes: bytes, ext: str) -> Path:
    settings = get_settings()
    now = datetime.now()
    sub = settings.data_path / "uploads" / f"{now:%Y}" / f"{now:%m}"
    sub.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    path = sub / name
    path.write_bytes(file_bytes)
    return path


def _make_thumbnail(image_path: Path, max_side: int = 240) -> str | None:
    try:
        thumb_dir = image_path.parent / "thumbs"
        thumb_dir.mkdir(exist_ok=True)
        thumb_path = thumb_dir / f"{image_path.stem}.jpg"
        with Image.open(image_path) as img:
            img = img.convert("RGB")
            img.thumbnail((max_side, max_side))
            img.save(thumb_path, "JPEG", quality=80)
        return str(thumb_path.relative_to(get_settings().data_path))
    except Exception:
        return None


async def ingest(
    *,
    kind: str,
    text: str | None,
    file_bytes: bytes | None,
    file_ext: str | None,
    hint: str | None,
    occurred_at: str | None,
) -> int:
    """Process one capture and persist it; return the new entry id."""
    provider = get_provider()
    settings = get_settings()

    body: str
    source_rel: str | None = None
    meta: dict = {}

    if kind == "text":
        if not text or not text.strip():
            raise ValueError("文字内容为空")
        body = text.strip()

    elif kind == "image":
        if not file_bytes or not file_ext:
            raise ValueError("缺少图片文件")
        path = _save_upload(file_bytes, file_ext)
        source_rel = str(path.relative_to(settings.data_path))
        body = await provider.describe_image(path, hint=hint)
        if text and text.strip():
            body = f"{text.strip()}\n\n[AI description] {body}"
        thumb = _make_thumbnail(path)
        if thumb:
            meta["thumbnail"] = thumb

    elif kind == "audio":
        if not file_bytes or not file_ext:
            raise ValueError("缺少音频文件")
        path = _save_upload(file_bytes, file_ext)
        source_rel = str(path.relative_to(settings.data_path))
        transcript = await provider.transcribe_audio(path)
        body = transcript or "(empty transcript)"
        if text and text.strip():
            body = f"{text.strip()}\n\n[Transcript] {body}"

    else:
        raise ValueError(f"未知 kind: {kind}")

    title = await provider.summarize_title(body)
    embedding = await provider.embed(f"{title}\n{body}")
    ensure_vec_table(len(embedding))

    occurred = occurred_at or datetime.now().isoformat(timespec="seconds")

    with transaction() as conn:
        cur = conn.execute(
            "INSERT INTO entries(occurred_at, kind, title, body, source_path, meta_json) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (occurred, kind, title, body, source_rel, json.dumps(meta, ensure_ascii=False) if meta else None),
        )
        entry_id = cur.lastrowid
        conn.execute(
            "INSERT INTO entries_vec(entry_id, embedding) VALUES (?, ?)",
            (entry_id, serialize_vector(embedding)),
        )

    return entry_id


def fetch_entry(entry_id: int) -> dict | None:
    row = get_conn().execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
    return dict(row) if row else None


def delete_entry(entry_id: int) -> bool:
    settings = get_settings()
    row = get_conn().execute("SELECT source_path FROM entries WHERE id = ?", (entry_id,)).fetchone()
    if row is None:
        return False
    with transaction() as conn:
        conn.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
        conn.execute("DELETE FROM entries_vec WHERE entry_id = ?", (entry_id,))
    if row["source_path"]:
        try:
            (settings.data_path / row["source_path"]).unlink(missing_ok=True)
        except Exception:
            pass
    return True
