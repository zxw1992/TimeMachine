"""Provider composition: lazy build deferral and capability fallback."""

from __future__ import annotations

import asyncio

import pytest

from app.ai.registry import _Lazy, _resolve_role, supports


def test_lazy_defers_build_error_until_used():
    """A missing key must not crash at construction — only when the capability
    is actually invoked (this is what lets a single-provider setup start)."""
    boom = RuntimeError("OPENAI_API_KEY is empty")

    def factory():
        raise boom

    lazy = _Lazy("openai", factory)
    # Probing the dim is safe even when the provider can't be built.
    assert lazy.embedding_dim == 0
    # Using it surfaces the original error.
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY is empty"):
        asyncio.run(lazy.embed("hi"))


def test_lazy_builds_once_and_reuses():
    calls = {"n": 0}

    class Fake:
        embedding_dim = 7

        async def embed(self, text):
            return [0.0] * 7

    def factory():
        calls["n"] += 1
        return Fake()

    lazy = _Lazy("fake", factory)
    assert lazy.embedding_dim == 7
    assert asyncio.run(lazy.embed("a")) == [0.0] * 7
    assert calls["n"] == 1  # constructed once, cached thereafter


def test_resolve_role_falls_back_when_incapable():
    # Claude can't embed → forced fallback to a capable built-in.
    assert _resolve_role("same", "embed", "claude") == "openai"
    # Claude can title → stays as the primary.
    assert _resolve_role("same", "title", "claude") == "claude"
    # An explicitly chosen, capable provider is respected.
    assert _resolve_role("gemini", "embed", "claude") == "gemini"


def test_supports_capability_table():
    assert supports("openai", "transcribe") is True
    assert supports("claude", "embed") is False
    assert supports("bailian", "embed") is True
    assert supports("qwen", "vision") is True  # alias resolves to bailian
