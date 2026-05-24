from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from ..ai.registry import get_provider
from ..db import get_conn, get_embedding_dim, serialize_vector
from ..schemas import EntryOut, SearchHit, SearchRequest, SearchResponse

router = APIRouter(prefix="/api/search", tags=["search"])

# Drop hits below this similarity score so clearly-unrelated memories don't
# surface. score = 1 - L2_distance over (roughly unit-norm) embeddings, so it
# sits in [-1, 1]; ~0.15 is the empirical "barely related" floor.
MIN_SCORE = 0.15


def _row_to_out(row: dict) -> EntryOut:
    meta = json.loads(row["meta_json"]) if row["meta_json"] else None
    source_url = f"/files/{row['source_path']}" if row["source_path"] else None
    return EntryOut(
        id=row["id"],
        occurred_at=row["occurred_at"],
        created_at=row["created_at"],
        kind=row["kind"],
        title=row["title"],
        body=row["body"],
        source_url=source_url,
        meta=meta,
    )


@router.post("", response_model=SearchResponse)
async def search(req: SearchRequest) -> SearchResponse:
    if get_embedding_dim() is None:
        return SearchResponse(hits=[])

    provider = get_provider()
    try:
        query_vec = await provider.embed(req.query)
    except Exception as e:
        raise HTTPException(500, f"embed 失败: {e}") from e

    conn = get_conn()
    kind_clause = ""
    args: list = [serialize_vector(query_vec), req.top_k]
    if req.kind:
        kind_clause = " AND e.kind = ?"
        args.append(req.kind)

    sql = f"""
        SELECT e.*, v.distance
        FROM entries_vec v
        JOIN entries e ON e.id = v.entry_id
        WHERE v.embedding MATCH ? AND k = ?{kind_clause}
        ORDER BY v.distance ASC
    """
    rows = conn.execute(sql, args).fetchall()
    hits = [
        hit
        for r in rows
        if (hit := SearchHit(entry=_row_to_out(dict(r)), score=float(1.0 - r["distance"]))).score
        >= MIN_SCORE
    ]
    return SearchResponse(hits=hits)
