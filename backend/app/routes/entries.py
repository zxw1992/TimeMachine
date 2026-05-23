from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from ..db import get_conn
from ..ingestion.pipeline import delete_entry, fetch_entry, ingest
from ..schemas import EntryOut

router = APIRouter(prefix="/api/entries", tags=["entries"])


def _row_to_out(row: dict) -> EntryOut:
    meta = json.loads(row["meta_json"]) if row.get("meta_json") else None
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
    )


@router.post("", response_model=EntryOut)
async def create_entry(
    kind: Annotated[str, Form()],
    text: Annotated[str | None, Form()] = None,
    hint: Annotated[str | None, Form()] = None,
    occurred_at: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
) -> EntryOut:
    if kind not in {"text", "image", "audio"}:
        raise HTTPException(400, f"非法 kind: {kind}")

    file_bytes: bytes | None = None
    file_ext: str | None = None
    if file is not None:
        file_bytes = await file.read()
        if file.filename:
            dot = file.filename.rfind(".")
            file_ext = file.filename[dot:].lower() if dot != -1 else ""
        if not file_ext:
            file_ext = ".png" if kind == "image" else ".webm"

    try:
        entry_id = await ingest(
            kind=kind,
            text=text,
            file_bytes=file_bytes,
            file_ext=file_ext,
            hint=hint,
            occurred_at=occurred_at,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

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


@router.delete("/{entry_id}")
async def delete(entry_id: int) -> dict:
    ok = delete_entry(entry_id)
    if not ok:
        raise HTTPException(404, "not found")
    return {"ok": True}
