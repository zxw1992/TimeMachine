"""On This Day: memories from the same month+day in previous years."""

from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter

from ..db import get_conn
from ..schemas import TimelineItem

router = APIRouter(prefix="/api/on-this-day", tags=["on-this-day"])


def _snippet(body: str, limit: int = 80) -> str:
    body = body.strip().replace("\n", " ")
    return body[:limit] + ("…" if len(body) > limit else "")


@router.get("", response_model=list[TimelineItem])
async def on_this_day() -> list[TimelineItem]:
    now = datetime.now()
    month_day = f"{now.month:02d}-{now.day:02d}"

    rows = get_conn().execute(
        "SELECT id, occurred_at, kind, title, body, source_path, meta_json, status "
        "FROM entries "
        "WHERE status = 'done' "
        "AND strftime('%m-%d', occurred_at) = ? "
        "AND CAST(strftime('%Y', occurred_at) AS INTEGER) < ? "
        "ORDER BY occurred_at DESC",
        (month_day, now.year),
    ).fetchall()

    out: list[TimelineItem] = []
    for r in rows:
        meta = json.loads(r["meta_json"]) if r["meta_json"] else {}
        source_url: str | None = None
        if meta.get("thumbnail"):
            source_url = f"/files/{meta['thumbnail']}"
        elif r["source_path"]:
            source_url = f"/files/{r['source_path']}"
        out.append(
            TimelineItem(
                id=r["id"],
                occurred_at=r["occurred_at"],
                kind=r["kind"],
                title=r["title"],
                snippet=_snippet(r["body"]),
                source_url=source_url,
                status=r["status"],
            )
        )
    return out
