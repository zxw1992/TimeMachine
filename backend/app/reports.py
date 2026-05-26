"""Weekly / monthly review reports.

Two layers, mirroring the UI: cheap **stats** computed from the database on
every view (entry counts, kind breakdown, per-day activity, top tags), and an
on-demand **AI summary** (headline / narrative / themes / highlight / a
decorative SVG poster) that is generated once per period and cached in the
`reports` table.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta

from .ai.registry import get_provider
from .db import get_conn, get_report, get_tags_for_entries, upsert_report

VALID_KINDS = ("week", "month")
_MAX_CONTEXT_ENTRIES = 80


def period_bounds(kind: str, offset: int) -> tuple[str, datetime, datetime]:
    """Return (period_key, start, end) for the period `offset` steps back.

    Weeks are Monday-based (matching the calendar heatmap); months are calendar
    months. `end` is exclusive. offset 0 = the current period."""
    if kind not in VALID_KINDS:
        raise ValueError(f"unknown report kind: {kind}")
    now = datetime.now()
    if kind == "week":
        monday = (now - timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        start = monday - timedelta(weeks=offset)
        end = start + timedelta(weeks=1)
        iso = start.isocalendar()
        key = f"{iso.year}-W{iso.week:02d}"
    else:  # month
        first = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        y, m = first.year, first.month - offset
        while m <= 0:
            m += 12
            y -= 1
        start = first.replace(year=y, month=m)
        ny, nm = (y, m + 1) if m < 12 else (y + 1, 1)
        end = start.replace(year=ny, month=nm)
        key = start.strftime("%Y-%m")
    return key, start, end


def _period_entries(start: datetime, end: datetime) -> list[dict]:
    rows = get_conn().execute(
        "SELECT id, occurred_at, kind, title, body, favorite FROM entries "
        "WHERE status = 'done' AND occurred_at >= ? AND occurred_at < ? "
        "ORDER BY occurred_at ASC",
        (start.isoformat(timespec="seconds"), end.isoformat(timespec="seconds")),
    ).fetchall()
    return [dict(r) for r in rows]


def compute_stats(entries: list[dict], start: datetime, end: datetime) -> dict:
    by_kind = {"text": 0, "image": 0, "audio": 0}
    favorites = 0
    for e in entries:
        by_kind[e["kind"]] = by_kind.get(e["kind"], 0) + 1
        if e["favorite"]:
            favorites += 1

    # Per-day activity across the whole period (empty days included).
    counts: dict[str, int] = {}
    for e in entries:
        counts[e["occurred_at"][:10]] = counts.get(e["occurred_at"][:10], 0) + 1
    daily = []
    day = start
    while day < end:
        key = day.strftime("%Y-%m-%d")
        daily.append({"date": key, "count": counts.get(key, 0)})
        day += timedelta(days=1)

    # Top tags across the period.
    tag_map = get_tags_for_entries([e["id"] for e in entries])
    tag_counts: dict[str, int] = {}
    for tags in tag_map.values():
        for t in tags:
            tag_counts[t] = tag_counts.get(t, 0) + 1
    top_tags = [
        {"name": name, "count": c}
        for name, c in sorted(tag_counts.items(), key=lambda kv: (-kv[1], kv[0]))
    ][:14]

    return {
        "count": len(entries),
        "by_kind": by_kind,
        "favorites": favorites,
        "daily": daily,
        "top_tags": top_tags,
    }


def _snippet(body: str, limit: int = 100) -> str:
    return " ".join(body.split())[:limit]


def _entries_context(entries: list[dict], stats: dict) -> str:
    """Compact text block fed to the model: stats line + one row per entry."""
    head = (
        f"{stats['count']} entries — "
        f"{stats['by_kind']['text']} text, {stats['by_kind']['image']} image, "
        f"{stats['by_kind']['audio']} audio; {stats['favorites']} favorited.\n"
    )
    tags = ", ".join(f"{t['name']}({t['count']})" for t in stats["top_tags"])
    if tags:
        head += f"Top tags: {tags}.\n"
    tag_map = get_tags_for_entries([e["id"] for e in entries])
    lines = []
    for e in entries[:_MAX_CONTEXT_ENTRIES]:
        day = e["occurred_at"][:10]
        title = e["title"] or "(untitled)"
        etags = tag_map.get(e["id"], [])
        tag_str = " " + " ".join(f"#{x}" for x in etags) if etags else ""
        lines.append(f"- {day} · {title} — {_snippet(e['body'])}{tag_str}")
    return head + "\nEntries:\n" + "\n".join(lines)


def _clean_svg(svg: str) -> str:
    """Light backend gate: only keep a poster that looks like a bounded SVG.
    The frontend does the real sanitization before rendering."""
    if not isinstance(svg, str):
        return ""
    svg = svg.strip()
    if not svg.startswith("<svg") or "<script" in svg.lower() or len(svg) > 12000:
        return ""
    return svg


def parse_report_payload(raw: str) -> dict:
    """Coerce the model's reply into the report shape. Tolerant of markdown
    fences and surrounding prose; falls back to using the raw text as the
    narrative so the user always gets something."""
    text = (raw or "").strip()
    data: dict | None = None
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                data = parsed
        except json.JSONDecodeError:
            data = None
    if data is None:
        return {
            "headline": "",
            "narrative": text,
            "themes": [],
            "highlight": "",
            "poster_svg": "",
        }
    themes = data.get("themes")
    if not isinstance(themes, list):
        themes = []
    return {
        "headline": str(data.get("headline") or "").strip()[:80],
        "narrative": str(data.get("narrative") or "").strip(),
        "themes": [str(t).strip()[:40] for t in themes if str(t).strip()][:8],
        "highlight": str(data.get("highlight") or "").strip()[:200],
        "poster_svg": _clean_svg(str(data.get("poster_svg") or "")),
    }


def overview(kind: str, offset: int) -> dict:
    """Stats for a period plus its cached AI report (or null), no AI call."""
    key, start, end = period_bounds(kind, offset)
    entries = _period_entries(start, end)
    stats = compute_stats(entries, start, end)
    cached = get_report(kind, key)
    report = None
    if cached:
        try:
            report = {
                "payload": json.loads(cached["payload"]),
                "generated_at": cached["created_at"],
                "entry_count": cached["entry_count"],
            }
        except json.JSONDecodeError:
            report = None
    return {
        "kind": kind,
        "offset": offset,
        "period_key": key,
        "period_start": start.isoformat(timespec="seconds"),
        "period_end": end.isoformat(timespec="seconds"),
        "stats": stats,
        "report": report,
    }


async def generate(kind: str, offset: int) -> dict:
    """Generate (and cache) the AI summary for a period. Raises ValueError if
    the period has no entries."""
    key, start, end = period_bounds(kind, offset)
    entries = _period_entries(start, end)
    if not entries:
        raise ValueError("这段时间还没有记忆，无法生成回顾")

    stats = compute_stats(entries, start, end)
    context = _entries_context(entries, stats)
    raw = await get_provider().summarize_period(context)
    payload = parse_report_payload(raw)
    upsert_report(
        kind,
        key,
        start.isoformat(timespec="seconds"),
        end.isoformat(timespec="seconds"),
        len(entries),
        json.dumps(payload, ensure_ascii=False),
    )
    return overview(kind, offset)
