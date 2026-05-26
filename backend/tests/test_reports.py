"""Review reports: period math, stats, robust parsing, and the cache round-trip."""

from __future__ import annotations

import asyncio
import json
from datetime import timedelta

import pytest

from app.reports import compute_stats, parse_report_payload, period_bounds


def _add(occurred: str, kind: str = "text", title: str = "T", body: str = "hello world"):
    from app import db

    with db.transaction() as conn:
        conn.execute(
            "INSERT INTO entries(occurred_at, kind, title, body, status) "
            "VALUES (?, ?, ?, ?, 'done')",
            (occurred, kind, title, body),
        )


def test_period_bounds_week_is_monday_based():
    key, start, end = period_bounds("week", 0)
    assert start.weekday() == 0  # Monday
    assert (end - start) == timedelta(weeks=1)
    assert key.startswith(str(start.isocalendar().year))
    # Previous week is exactly 7 days earlier.
    _, prev_start, _ = period_bounds("week", 1)
    assert start - prev_start == timedelta(weeks=1)


def test_period_bounds_month():
    key, start, end = period_bounds("month", 0)
    assert start.day == 1
    assert end.day == 1
    assert key == start.strftime("%Y-%m")


def test_period_bounds_rejects_bad_kind():
    with pytest.raises(ValueError):
        period_bounds("year", 0)


def test_compute_stats_counts_kinds_and_days():
    _, start, end = period_bounds("week", 0)
    inside = (start + timedelta(days=1)).replace(hour=9).isoformat(timespec="seconds")
    _add(inside, kind="text")
    _add(inside, kind="image")
    from app.reports import _period_entries

    stats = compute_stats(_period_entries(start, end), start, end)
    assert stats["count"] == 2
    assert stats["by_kind"] == {"text": 1, "image": 1, "audio": 0}
    assert len(stats["daily"]) == 7  # one bar per day of the week


def test_parse_report_payload_plain_and_fenced():
    obj = {"headline": "A week", "narrative": "You did things.", "themes": ["x", "y"],
           "highlight": "nice", "poster_svg": ""}
    assert parse_report_payload(json.dumps(obj))["headline"] == "A week"
    fenced = f"```json\n{json.dumps(obj)}\n```"
    assert parse_report_payload(fenced)["themes"] == ["x", "y"]
    prose = f"Here you go:\n{json.dumps(obj)}\nHope it helps."
    assert parse_report_payload(prose)["highlight"] == "nice"


def test_parse_report_payload_fallback_to_narrative():
    out = parse_report_payload("just some prose, no json")
    assert out["narrative"] == "just some prose, no json"
    assert out["themes"] == [] and out["headline"] == ""


def test_parse_report_payload_rejects_unsafe_svg():
    bad = {"narrative": "n", "poster_svg": "<svg><script>alert(1)</script></svg>"}
    assert parse_report_payload(json.dumps(bad))["poster_svg"] == ""
    notsvg = {"narrative": "n", "poster_svg": "<div>nope</div>"}
    assert parse_report_payload(json.dumps(notsvg))["poster_svg"] == ""
    good = {"narrative": "n", "poster_svg": '<svg viewBox="0 0 800 280"><rect/></svg>'}
    assert parse_report_payload(json.dumps(good))["poster_svg"].startswith("<svg")


class ReportProvider:
    embedding_dim = 8

    async def summarize_period(self, body):
        return json.dumps(
            {
                "headline": "Quiet week",
                "narrative": "You wrote a little.",
                "themes": ["calm", "notes"],
                "highlight": "a small moment",
                "poster_svg": '<svg viewBox="0 0 800 280"><rect width="800" height="280"/></svg>',
            }
        )


def test_overview_then_generate_caches(monkeypatch):
    from app import reports

    monkeypatch.setattr(reports, "get_provider", lambda: ReportProvider())

    _, start, _ = period_bounds("week", 0)
    _add((start + timedelta(days=1)).replace(hour=10).isoformat(timespec="seconds"))

    # Before generation: stats present, no cached report.
    ov = reports.overview("week", 0)
    assert ov["stats"]["count"] == 1
    assert ov["report"] is None

    # Generate → cached and returned.
    gen = asyncio.run(reports.generate("week", 0))
    assert gen["report"]["payload"]["headline"] == "Quiet week"
    assert gen["report"]["entry_count"] == 1

    # A fresh overview now serves the cached report (no AI call needed).
    assert reports.overview("week", 0)["report"]["payload"]["themes"] == ["calm", "notes"]


def test_generate_empty_period_raises(monkeypatch):
    from app import reports

    monkeypatch.setattr(reports, "get_provider", lambda: ReportProvider())
    # offset 300 weeks back — guaranteed empty.
    with pytest.raises(ValueError):
        asyncio.run(reports.generate("week", 300))
