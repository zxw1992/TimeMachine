from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

EntryKind = Literal["text", "image", "audio"]


class EntryOut(BaseModel):
    id: int
    occurred_at: str
    created_at: str
    kind: EntryKind
    title: str | None = None
    body: str
    source_url: str | None = None
    meta: dict | None = None
    status: str = "done"


class TimelineItem(BaseModel):
    id: int
    occurred_at: str
    kind: EntryKind
    title: str | None = None
    snippet: str
    source_url: str | None = None
    status: str = "done"


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = 20
    kind: EntryKind | None = None


class SearchHit(BaseModel):
    entry: EntryOut
    score: float


class SearchResponse(BaseModel):
    hits: list[SearchHit]
