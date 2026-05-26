"""Tag dictionary: every tag in use, with its entry count (for filter/autocomplete)."""

from __future__ import annotations

from fastapi import APIRouter

from ..db import list_all_tags
from ..schemas import TagInfo

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("", response_model=list[TagInfo])
async def list_tags() -> list[TagInfo]:
    return [TagInfo(**t) for t in list_all_tags()]
