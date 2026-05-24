from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path

from PIL import Image

from ..ai.registry import get_provider
from ..config import get_settings
from ..db import (
    ensure_vec_table,
    get_conn,
    serialize_vector,
    transaction,
    update_entry_status,
)


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


def create_pending(
    *,
    kind: str,
    text: str | None,
    file_bytes: bytes | None,
    file_ext: str | None,
    hint: str | None,
    occurred_at: str | None,
) -> int:
    """Persist a capture immediately as a 'queued' entry and return its id.

    Only fast, local work happens here (validation, saving the upload, the
    thumbnail). The slow AI steps run later in `process_entry`. The user's
    raw text and hint are stashed under meta['_pending'] for that step.
    """
    settings = get_settings()
    source_rel: str | None = None
    meta: dict = {}
    user_text = (text or "").strip()

    if kind == "text":
        if not user_text:
            raise ValueError("文字内容为空")
        body = user_text
    elif kind == "image":
        if not file_bytes or not file_ext:
            raise ValueError("缺少图片文件")
        path = _save_upload(file_bytes, file_ext)
        source_rel = str(path.relative_to(settings.data_path))
        thumb = _make_thumbnail(path)
        if thumb:
            meta["thumbnail"] = thumb
        body = user_text  # filled in after AI description
    elif kind == "audio":
        if not file_bytes or not file_ext:
            raise ValueError("缺少音频文件")
        path = _save_upload(file_bytes, file_ext)
        source_rel = str(path.relative_to(settings.data_path))
        body = user_text  # filled in after transcription
    else:
        raise ValueError(f"未知 kind: {kind}")

    meta["_pending"] = {"user_text": user_text, "hint": hint}
    occurred = occurred_at or datetime.now().isoformat(timespec="seconds")

    with transaction() as conn:
        cur = conn.execute(
            "INSERT INTO entries(occurred_at, kind, title, body, source_path, meta_json, status) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (occurred, kind, None, body, source_rel, json.dumps(meta, ensure_ascii=False), "queued"),
        )
        return cur.lastrowid


async def process_entry(entry_id: int) -> None:
    """Run the AI steps for a queued entry, updating its status at each stage.

    Always resolves to 'done' or 'error'; never raises (it runs detached as a
    background task).
    """
    try:
        row = fetch_entry(entry_id)
        if row is None:
            return
        kind = row["kind"]
        meta = json.loads(row["meta_json"]) if row["meta_json"] else {}
        pending = meta.pop("_pending", {})
        user_text = pending.get("user_text") or ""
        hint = pending.get("hint")

        provider = get_provider()
        settings = get_settings()

        if kind == "image":
            update_entry_status(entry_id, "describing")
            path = settings.data_path / row["source_path"]
            desc = await provider.describe_image(path, hint=hint)
            body = f"{user_text}\n\n[AI description] {desc}" if user_text else desc
        elif kind == "audio":
            update_entry_status(entry_id, "transcribing")
            path = settings.data_path / row["source_path"]
            transcript = await provider.transcribe_audio(path) or "(empty transcript)"
            body = f"{user_text}\n\n[Transcript] {transcript}" if user_text else transcript
        else:
            body = user_text

        update_entry_status(entry_id, "titling")
        title = await provider.summarize_title(body)

        update_entry_status(entry_id, "embedding")
        embedding = await provider.embed(f"{title}\n{body}")
        ensure_vec_table(len(embedding))

        with transaction() as conn:
            conn.execute(
                "UPDATE entries SET title = ?, body = ?, meta_json = ?, status = 'done' WHERE id = ?",
                (title, body, json.dumps(meta, ensure_ascii=False) if meta else None, entry_id),
            )
            conn.execute(
                "INSERT INTO entries_vec(entry_id, embedding) VALUES (?, ?)",
                (entry_id, serialize_vector(embedding)),
            )
    except Exception as e:  # noqa: BLE001
        try:
            row = fetch_entry(entry_id)
            meta = json.loads(row["meta_json"]) if row and row["meta_json"] else {}
            meta.pop("_pending", None)
            meta["error"] = f"{type(e).__name__}: {e}"
            with transaction() as conn:
                conn.execute(
                    "UPDATE entries SET meta_json = ?, status = 'error' WHERE id = ?",
                    (json.dumps(meta, ensure_ascii=False), entry_id),
                )
        except Exception:
            update_entry_status(entry_id, "error")


def fetch_entry(entry_id: int) -> dict | None:
    row = get_conn().execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
    return dict(row) if row else None


def delete_entry(entry_id: int) -> bool:
    settings = get_settings()
    row = get_conn().execute(
        "SELECT source_path, meta_json FROM entries WHERE id = ?", (entry_id,)
    ).fetchone()
    if row is None:
        return False
    with transaction() as conn:
        conn.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
        conn.execute("DELETE FROM entries_vec WHERE entry_id = ?", (entry_id,))

    # Remove on-disk artifacts so they don't become orphans: the original
    # upload plus the generated thumbnail (stored under meta['thumbnail']).
    rels = [row["source_path"]]
    if row["meta_json"]:
        try:
            rels.append(json.loads(row["meta_json"]).get("thumbnail"))
        except Exception:
            pass
    for rel in rels:
        if rel:
            try:
                (settings.data_path / rel).unlink(missing_ok=True)
            except Exception:
                pass
    return True
