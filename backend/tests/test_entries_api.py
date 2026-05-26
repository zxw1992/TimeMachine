"""HTTP-level checks for the tag/favorite surface through the real app.

Exercises multipart form parsing of repeated `tags` fields, the PATCH route,
timeline filtering, and JSON serialization — things the db-level tests don't.
"""

from __future__ import annotations

import pytest


class FakeProvider:
    embedding_dim = 8

    async def describe_image(self, path, hint=None):
        return "desc"

    async def transcribe_audio(self, path):
        return "transcript"

    async def summarize_title(self, body):
        return "Title"

    async def embed(self, text):
        return [0.1] * 8


@pytest.fixture
def client(monkeypatch):
    from fastapi.testclient import TestClient

    from app.ingestion import pipeline

    # Keep the background AI step deterministic and offline.
    monkeypatch.setattr(pipeline, "get_provider", lambda: FakeProvider())
    from app.main import app

    with TestClient(app) as c:
        yield c


def _create(client, text, tags=None):
    data = {"kind": "text", "text": text, "tags": tags or []}
    # The route declares File() params, so the body must be multipart. Passing a
    # `files` kwarg makes httpx use multipart encoding; this dummy field is not
    # bound by the route and is ignored.
    return client.post("/api/entries", data=data, files={"_ignore": ("x.txt", b"x")})


def test_create_with_tags_then_listed(client):
    r = _create(client, "hello", tags=["Work", "idea"])
    assert r.status_code == 200
    body = r.json()
    assert body["tags"] == ["idea", "Work"]  # sorted, NOCASE
    assert body["favorite"] is False

    tags = client.get("/api/tags").json()
    names = {t["name"] for t in tags}
    assert {"Work", "idea"} <= names


def test_patch_favorite_and_tags(client):
    eid = _create(client, "note").json()["id"]

    r = client.patch(f"/api/entries/{eid}", json={"favorite": True, "tags": ["x", "y"]})
    assert r.status_code == 200
    out = r.json()
    assert out["favorite"] is True
    assert out["tags"] == ["x", "y"]


def test_timeline_filters_by_favorite_and_tag(client):
    a = _create(client, "first", tags=["alpha"]).json()["id"]
    _create(client, "second", tags=["beta"])
    client.patch(f"/api/entries/{a}", json={"favorite": True})

    fav = client.get("/api/timeline", params={"favorite": "true"}).json()
    assert [it["id"] for it in fav] == [a]

    tagged = client.get("/api/timeline", params={"tag": "beta"}).json()
    assert len(tagged) == 1 and tagged[0]["tags"] == ["beta"]

    # An unused tag yields nothing.
    assert client.get("/api/timeline", params={"tag": "nope"}).json() == []
