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
    set_entry_tags,
    set_favorite,
    transaction,
    update_entry_status,
)
from ..logging_config import get_logger

log = get_logger(__name__)


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
    uploads: list[tuple[bytes, str]] | None,
    hint: str | None,
    occurred_at: str | None,
) -> int:
    """Persist a capture immediately as a 'queued' entry and return its id.

    Only fast, local work happens here (validation, saving the upload(s), the
    thumbnail). The slow AI steps run later in `process_entry`. The user's
    raw text and hint are stashed under meta['_pending'] for that step.

    `uploads` is a list of (bytes, ext); an image capture may carry several
    files, which together form a single entry. The first file's path is kept in
    `source_path` (for the timeline thumbnail and search) and the full set under
    meta['images'] = [{"path", "thumb"}, ...]. Audio uses only the first file.
    """
    settings = get_settings()
    source_rel: str | None = None
    meta: dict = {}
    user_text = (text or "").strip()
    uploads = uploads or []

    if kind == "text":
        if not user_text:
            raise ValueError("文字内容为空")
        body = user_text
    elif kind == "image":
        if not uploads:
            raise ValueError("缺少图片文件")
        images: list[dict] = []
        for data, ext in uploads:
            path = _save_upload(data, ext)
            images.append(
                {"path": str(path.relative_to(settings.data_path)), "thumb": _make_thumbnail(path)}
            )
        source_rel = images[0]["path"]
        meta["images"] = images
        if images[0]["thumb"]:  # primary thumbnail keeps the existing timeline behavior
            meta["thumbnail"] = images[0]["thumb"]
        body = user_text  # filled in after AI description
    elif kind == "audio":
        if not uploads:
            raise ValueError("缺少音频文件")
        data, ext = uploads[0]
        path = _save_upload(data, ext)
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
            # An image entry may hold several pictures (meta['images']); describe
            # each and combine into one body. Fall back to source_path for older
            # single-image entries created before meta['images'] existed.
            images = meta.get("images") or (
                [{"path": row["source_path"]}] if row["source_path"] else []
            )
            parts: list[str] = []
            for i, img in enumerate(images, 1):
                d = await provider.describe_image(settings.data_path / img["path"], hint=hint)
                parts.append(d if len(images) <= 1 else f"[Image {i}] {d}")
            desc = "\n\n".join(parts)
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

        # Suggest tags for the user to accept later (best-effort — never block
        # ingestion on it). Stored under meta['suggested_tags'], not applied.
        try:
            suggested = await provider.suggest_tags(body)
            if suggested:
                meta["suggested_tags"] = suggested
        except Exception:  # noqa: BLE001
            log.warning("tag suggestion failed for entry %s", entry_id, exc_info=True)

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
        log.exception("processing failed for entry %s", entry_id)
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


async def update_entry(
    entry_id: int,
    *,
    title: str | None = None,
    body: str | None = None,
    occurred_at: str | None = None,
    tags: list[str] | None = None,
    favorite: bool | None = None,
) -> dict | None:
    """Edit an entry's fields, returning the updated row.

    A field left as None is kept as-is; an empty (whitespace) title clears it.
    FTS stays in sync via the `entries_au` trigger. When the body changes we
    re-embed so semantic search doesn't drift; a title-only edit skips the AI
    call (title is a minor signal). `tags` / `favorite` are lightweight and may
    be set even while the entry is still processing; editing the text fields
    requires a finished entry.

    Returns None if the entry doesn't exist. Raises ValueError if a text edit is
    attempted on an unfinished entry, or if the body would become empty.
    """
    row = fetch_entry(entry_id)
    if row is None:
        return None

    text_edit = title is not None or body is not None or occurred_at is not None
    if text_edit and (row.get("status") or "done") != "done":
        raise ValueError("条目尚在处理中，暂不可编辑")

    new_title = row["title"] if title is None else (title.strip() or None)
    new_body = row["body"] if body is None else body.strip()
    new_occurred = occurred_at or row["occurred_at"]
    if not new_body:
        raise ValueError("正文不能为空")

    body_changed = new_body != row["body"]

    if text_edit:
        with transaction() as conn:
            conn.execute(
                "UPDATE entries SET title = ?, body = ?, occurred_at = ? WHERE id = ?",
                (new_title, new_body, new_occurred, entry_id),
            )

    if favorite is not None:
        set_favorite(entry_id, favorite)
    if tags is not None:
        set_entry_tags(entry_id, tags)

    # The text edit above is committed. Re-embed on body change; an embedding
    # failure leaves a stale vector but never loses the saved edit.
    if body_changed:
        await reembed_entry(entry_id)

    return fetch_entry(entry_id)


async def reembed_entry(entry_id: int) -> bool:
    """(Re)compute an entry's embedding and replace its vector row.

    Used by edits and by import (where entries arrive with final text but no
    vector). Best-effort: returns False and logs on failure (e.g. no API key),
    leaving full-text search — which is trigger-driven — still working.
    """
    row = fetch_entry(entry_id)
    if row is None:
        return False
    try:
        embedding = await get_provider().embed(f"{row['title'] or ''}\n{row['body']}")
        ensure_vec_table(len(embedding))
        with transaction() as conn:
            conn.execute("DELETE FROM entries_vec WHERE entry_id = ?", (entry_id,))
            conn.execute(
                "INSERT INTO entries_vec(entry_id, embedding) VALUES (?, ?)",
                (entry_id, serialize_vector(embedding)),
            )
        return True
    except Exception:  # noqa: BLE001
        log.exception("embedding failed for entry %s", entry_id)
        return False


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
        # entry_tags rows cascade with the entry; drop any now-orphaned tags.
        conn.execute("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM entry_tags)")

    # Remove on-disk artifacts so they don't become orphans: every uploaded
    # image plus its thumbnail (meta['images']), the primary thumbnail, and the
    # source_path (covers audio and older single-image entries).
    rels: list[str | None] = [row["source_path"]]
    if row["meta_json"]:
        try:
            m = json.loads(row["meta_json"])
            rels.append(m.get("thumbnail"))
            for img in m.get("images") or []:
                rels.append(img.get("path"))
                rels.append(img.get("thumb"))
        except Exception:
            pass
    for rel in rels:
        if rel:
            try:
                (settings.data_path / rel).unlink(missing_ok=True)
            except Exception:
                pass
    return True
