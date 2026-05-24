from __future__ import annotations

import json

from fastapi import APIRouter, Query

from ..db import get_conn
from ..schemas import TimelineItem

router = APIRouter(prefix="/api/timeline", tags=["timeline"])


def _snippet(body: str, limit: int = 80) -> str:
    body = body.strip().replace("\n", " ")
    return body[:limit] + ("…" if len(body) > limit else "")


@router.get("", response_model=list[TimelineItem])
async def list_timeline(
    from_: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
    kind: str | None = Query(None),
    limit: int = Query(500, le=2000),
    order: str = Query("asc", pattern="^(asc|desc)$"),
) -> list[TimelineItem]:
    sql = "SELECT id, occurred_at, kind, title, body, source_path, meta_json, status FROM entries WHERE 1=1"
    args: list = []
    if from_:
        sql += " AND occurred_at >= ?"
        args.append(from_)
    if to:
        sql += " AND occurred_at <= ?"
        args.append(to)
    if kind:
        sql += " AND kind = ?"
        args.append(kind)
    sql += f" ORDER BY occurred_at {order.upper()} LIMIT ?"
    args.append(limit)

    rows = get_conn().execute(sql, args).fetchall()
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
                status=r["status"] if "status" in r.keys() else "done",
            )
        )
    return out
