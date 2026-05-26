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
    tags: list[str] = []
    favorite: bool = False


class EntryUpdate(BaseModel):
    """Editable fields of an existing entry. Any field left None is untouched;
    an empty `title` clears it. Body re-embeds; FTS syncs via DB trigger.
    `tags` and `favorite` can be set even while the entry is still processing."""

    title: str | None = None
    body: str | None = None
    occurred_at: str | None = None
    tags: list[str] | None = None
    favorite: bool | None = None


class TimelineItem(BaseModel):
    id: int
    occurred_at: str
    kind: EntryKind
    title: str | None = None
    snippet: str
    source_url: str | None = None
    status: str = "done"
    tags: list[str] = []
    favorite: bool = False


class TagInfo(BaseModel):
    name: str
    count: int


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = 20
    kind: EntryKind | None = None


class SearchHit(BaseModel):
    entry: EntryOut
    score: float


class SearchResponse(BaseModel):
    hits: list[SearchHit]
