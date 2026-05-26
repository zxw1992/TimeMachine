"""Export / import: take all your data out (backup zip + readable Markdown) and
restore a backup. The backup format round-trips losslessly; import is additive
and de-duplicates so re-running it doesn't pile up copies.

A backup zip contains:
  - timemachine.json  — the manifest (schema below)
  - media/uploads/...  — every referenced image / audio / thumbnail file,
                         keyed by its original data-relative path.

A markdown zip contains:
  - timemachine.md     — memories grouped by day, with media links
  - media/uploads/...  — the same media, so image links resolve offline.
"""

from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime
from pathlib import Path

from .config import get_settings
from .db import get_conn, get_entry_tags, set_entry_tags, transaction

BACKUP_FORMAT = "aitimemachine-backup"
BACKUP_VERSION = 1
MANIFEST_NAME = "timemachine.json"


def _clean_meta(meta_json: str | None) -> dict:
    if not meta_json:
        return {}
    try:
        meta = json.loads(meta_json)
    except json.JSONDecodeError:
        return {}
    return {k: v for k, v in meta.items() if not k.startswith("_")} if isinstance(meta, dict) else {}


def _media_paths(source_path: str | None, meta: dict) -> list[str]:
    """All data-relative file paths an entry references (deduped, order-stable)."""
    paths: list[str] = []
    if source_path:
        paths.append(source_path)
    if isinstance(meta.get("thumbnail"), str):
        paths.append(meta["thumbnail"])
    for img in meta.get("images") or []:
        if isinstance(img, dict):
            if isinstance(img.get("path"), str):
                paths.append(img["path"])
            if isinstance(img.get("thumb"), str):
                paths.append(img["thumb"])
    seen: set[str] = set()
    return [p for p in paths if not (p in seen or seen.add(p))]


def _iter_entries() -> list[dict]:
    """All entries as manifest dicts, oldest first, with tags and clean meta."""
    rows = get_conn().execute(
        "SELECT id, occurred_at, created_at, kind, title, body, source_path, "
        "meta_json, status, favorite FROM entries ORDER BY occurred_at ASC"
    ).fetchall()
    out: list[dict] = []
    for r in rows:
        meta = _clean_meta(r["meta_json"])
        out.append(
            {
                "occurred_at": r["occurred_at"],
                "created_at": r["created_at"],
                "kind": r["kind"],
                "title": r["title"],
                "body": r["body"],
                "favorite": bool(r["favorite"]),
                "tags": get_entry_tags(r["id"]),
                "meta": meta,
                "source_path": r["source_path"],
                "_media": _media_paths(r["source_path"], meta),
            }
        )
    return out


def _add_media(zf: zipfile.ZipFile, rel_paths: list[str], written: set[str]) -> None:
    """Copy referenced media files into the zip under media/<rel_path>. Missing
    files are skipped (an entry may outlive a deleted upload)."""
    data_path = get_settings().data_path
    for rel in rel_paths:
        if rel in written:
            continue
        src = data_path / rel
        if src.is_file():
            zf.write(src, f"media/{rel}")
            written.add(rel)


def build_backup_zip() -> bytes:
    entries = _iter_entries()
    manifest = {
        "format": BACKUP_FORMAT,
        "version": BACKUP_VERSION,
        "exported_at": datetime.now().isoformat(timespec="seconds"),
        "entry_count": len(entries),
        "entries": [{k: v for k, v in e.items() if k != "_media"} for e in entries],
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(MANIFEST_NAME, json.dumps(manifest, ensure_ascii=False, indent=2))
        written: set[str] = set()
        for e in entries:
            _add_media(zf, e["_media"], written)
    return buf.getvalue()


def _md_for_entry(e: dict) -> str:
    lines: list[str] = []
    t = e["occurred_at"][11:16]  # HH:MM
    star = " ♥" if e["favorite"] else ""
    heading = e["title"] or "(untitled)"
    lines.append(f"### {t} · {heading}{star}")
    if e["tags"]:
        lines.append(" ".join(f"`#{tag}`" for tag in e["tags"]))
    for rel in e["_media"]:
        if e["kind"] == "image" and rel in (e.get("source_path"), *(
            img.get("path") for img in (e["meta"].get("images") or []) if isinstance(img, dict)
        )):
            lines.append(f"![](media/{rel})")
        elif e["kind"] == "audio" and rel == e.get("source_path"):
            lines.append(f"🎵 [{Path(rel).name}](media/{rel})")
    if e["body"]:
        lines.append("")
        lines.append(e["body"])
    return "\n".join(lines)


def build_markdown_zip() -> bytes:
    entries = _iter_entries()
    parts: list[str] = [
        "# AI Time Machine",
        f"> {len(entries)} memories · exported "
        f"{datetime.now().isoformat(timespec='minutes')}",
        "",
    ]
    current_day = None
    for e in entries:
        day = e["occurred_at"][:10]
        if day != current_day:
            current_day = day
            parts.append(f"\n## {day}\n")
        parts.append(_md_for_entry(e))
        parts.append("")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("timemachine.md", "\n".join(parts))
        written: set[str] = set()
        for e in entries:
            _add_media(zf, e["_media"], written)
    return buf.getvalue()


# ───────────────────────── Import ─────────────────────────


def _safe_media_rel(name: str) -> str | None:
    """Map a zip member name to a safe data-relative path, or None to reject.

    Guards against zip-slip: only `media/uploads/...` members are accepted, and
    the resolved target must stay inside data/uploads."""
    if not name.startswith("media/"):
        return None
    rel = name[len("media/"):]
    if not rel or rel.endswith("/"):
        return None
    parts = Path(rel).parts
    if parts[0] != "uploads" or ".." in parts:
        return None
    return rel


def import_backup(zip_bytes: bytes) -> dict:
    """Restore entries from a backup zip. Additive and de-duplicated: an entry
    whose (occurred_at, kind, title, body) already exists is skipped.

    Media files are written back to their original data-relative paths; each
    entry is inserted with a fresh id. Returns counts and the new entry ids
    (so the caller can embed them in the background)."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile as e:
        raise ValueError("文件不是有效的 zip 备份") from e

    names = set(zf.namelist())
    if MANIFEST_NAME not in names:
        raise ValueError("缺少 timemachine.json，这不是本应用的备份文件")

    try:
        manifest = json.loads(zf.read(MANIFEST_NAME))
    except json.JSONDecodeError as e:
        raise ValueError("timemachine.json 解析失败") from e
    if manifest.get("format") != BACKUP_FORMAT:
        raise ValueError("备份格式不匹配")

    entries = manifest.get("entries") or []

    # Restore media first so files exist before rows reference them.
    data_path = get_settings().data_path
    for name in names:
        rel = _safe_media_rel(name)
        if rel is None:
            continue
        target = data_path / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(zf.read(name))

    conn = get_conn()
    imported_ids: list[int] = []
    skipped = 0
    with transaction() as tconn:
        for e in entries:
            occurred = e.get("occurred_at") or datetime.now().isoformat(timespec="seconds")
            kind = e.get("kind") or "text"
            title = e.get("title")
            body = e.get("body") or ""
            dup = conn.execute(
                "SELECT 1 FROM entries WHERE occurred_at = ? AND kind = ? "
                "AND IFNULL(title,'') = IFNULL(?,'') AND body = ? LIMIT 1",
                (occurred, kind, title, body),
            ).fetchone()
            if dup:
                skipped += 1
                continue
            meta = e.get("meta") or {}
            cur = tconn.execute(
                "INSERT INTO entries(occurred_at, created_at, kind, title, body, "
                "source_path, meta_json, status, favorite) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 'done', ?)",
                (
                    occurred,
                    e.get("created_at") or occurred,
                    kind,
                    title,
                    body,
                    e.get("source_path"),
                    json.dumps(meta, ensure_ascii=False) if meta else None,
                    1 if e.get("favorite") else 0,
                ),
            )
            imported_ids.append(cur.lastrowid)
            # Tags are applied after the insert commits below.
            e["_new_id"] = cur.lastrowid

    # set_entry_tags opens its own transaction, so run it after the insert commit.
    # (favorite is already set on the INSERT above.)
    for e in entries:
        if "_new_id" in e and e.get("tags"):
            set_entry_tags(e["_new_id"], e["tags"])

    return {
        "imported": len(imported_ids),
        "skipped": skipped,
        "total": len(entries),
        "ids": imported_ids,
    }
