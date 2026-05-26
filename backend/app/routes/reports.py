"""Review reports: GET returns period stats + any cached AI summary; POST
generates (and caches) the AI summary for a period."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from .. import reports

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _check_kind(kind: str) -> None:
    if kind not in reports.VALID_KINDS:
        raise HTTPException(400, f"unknown report kind: {kind}")


@router.get("/{kind}")
async def get_overview(kind: str, offset: int = Query(0, ge=0, le=520)) -> dict:
    _check_kind(kind)
    return reports.overview(kind, offset)


@router.post("/{kind}")
async def generate_report(kind: str, offset: int = Query(0, ge=0, le=520)) -> dict:
    _check_kind(kind)
    try:
        return await reports.generate(kind, offset)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
