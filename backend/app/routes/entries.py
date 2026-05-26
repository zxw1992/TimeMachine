from __future__ import annotations

import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from ..db import get_conn
from ..ingestion.pipeline import (
    create_pending,
    delete_entry,
    fetch_entry,
    process_entry,
    update_entry,
)
from ..schemas import EntryOut, EntryUpdate

router = APIRouter(prefix="/api/entries", tags=["entries"])

# Keep references to detached processing tasks so they aren't garbage-collected.
_bg_tasks: set[asyncio.Task] = set()


def _row_to_out(row: dict) -> EntryOut:
    meta = json.loads(row["meta_json"]) if row.get("meta_json") else None
    if isinstance(meta, dict):
        # Drop internal bookkeeping keys (e.g. _pending) before exposing.
        meta = {k: v for k, v in meta.items() if not k.startswith("_")} or None
    source_url = f"/files/{row['source_path']}" if row.get("source_path") else None
    return EntryOut(
        id=row["id"],
        occurred_at=row["occurred_at"],
        created_at=row["created_at"],
        kind=row["kind"],
        title=row.get("title"),
        body=row["body"],
        source_url=source_url,
        meta=meta,
        status=row.get("status") or "done",
    )


@router.post("", response_model=EntryOut)
async def create_entry(
    kind: Annotated[str, Form()],
    text: Annotated[str | None, Form()] = None,
    hint: Annotated[str | None, Form()] = None,
    occurred_at: Annotated[str | None, Form()] = None,
    files: Annotated[list[UploadFile] | None, File()] = None,
) -> EntryOut:
    if kind not in {"text", "image", "audio"}:
        raise HTTPException(400, f"非法 kind: {kind}")

    # An image capture may carry several files that form one entry; audio sends
    # one. Read them all into (bytes, ext) pairs for the pipeline.
    uploads: list[tuple[bytes, str]] = []
    for f in files or []:
        data = await f.read()
        if not data:
            continue
        ext = ""
        if f.filename:
            dot = f.filename.rfind(".")
            ext = f.filename[dot:].lower() if dot != -1 else ""
        if not ext:
            ext = ".png" if kind == "image" else ".webm"
        uploads.append((data, ext))

    try:
        entry_id = create_pending(
            kind=kind,
            text=text,
            uploads=uploads,
            hint=hint,
            occurred_at=occurred_at,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    # Run the slow AI steps in the background; the client polls the entry.
    task = asyncio.create_task(process_entry(entry_id))
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)

    row = fetch_entry(entry_id)
    if row is None:
        raise HTTPException(500, "entry 写入后未找到")
    return _row_to_out(row)


@router.get("", response_model=list[EntryOut])
async def list_entries(
    limit: int = Query(10, ge=1, le=100),
    order: str = Query("desc", pattern="^(asc|desc)$"),
) -> list[EntryOut]:
    sql = f"SELECT * FROM entries ORDER BY occurred_at {order.upper()} LIMIT ?"
    rows = get_conn().execute(sql, (limit,)).fetchall()
    return [_row_to_out(dict(r)) for r in rows]


@router.get("/{entry_id}", response_model=EntryOut)
async def get_entry(entry_id: int) -> EntryOut:
    row = fetch_entry(entry_id)
    if row is None:
        raise HTTPException(404, "not found")
    return _row_to_out(row)


@router.patch("/{entry_id}", response_model=EntryOut)
async def update(entry_id: int, payload: EntryUpdate) -> EntryOut:
    try:
        row = await update_entry(
            entry_id,
            title=payload.title,
            body=payload.body,
            occurred_at=payload.occurred_at,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if row is None:
        raise HTTPException(404, "not found")
    return _row_to_out(row)


@router.delete("/{entry_id}")
async def delete(entry_id: int) -> dict:
    ok = delete_entry(entry_id)
    if not ok:
        raise HTTPException(404, "not found")
    return {"ok": True}
