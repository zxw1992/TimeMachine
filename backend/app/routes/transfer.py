"""Export / import endpoints. Export streams a zip download; import accepts a
backup zip and restores it, then embeds the new entries in the background."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Response, UploadFile

from ..ingestion.pipeline import reembed_entry
from ..logging_config import get_logger
from ..transfer import build_backup_zip, build_markdown_zip, import_backup

router = APIRouter(prefix="/api", tags=["transfer"])
log = get_logger(__name__)

# Hold references to detached embedding tasks so they aren't GC'd mid-run.
_bg_tasks: set[asyncio.Task] = set()


def _zip_response(data: bytes, stem: str) -> Response:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    filename = f"{stem}-{stamp}.zip"
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/backup")
async def export_backup() -> Response:
    return _zip_response(build_backup_zip(), "timemachine-backup")


@router.get("/export/markdown")
async def export_markdown() -> Response:
    return _zip_response(build_markdown_zip(), "timemachine-markdown")


async def _embed_imported(ids: list[int]) -> None:
    for entry_id in ids:
        await reembed_entry(entry_id)


@router.post("/import")
async def import_data(file: Annotated[UploadFile, File()]) -> dict:
    data = await file.read()
    try:
        result = import_backup(data)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    # Imported entries arrive with final text but no vector — embed them in the
    # background so search works, without blocking the upload response.
    ids = result.pop("ids", [])
    if ids:
        task = asyncio.create_task(_embed_imported(ids))
        _bg_tasks.add(task)
        task.add_done_callback(_bg_tasks.discard)
    return result
