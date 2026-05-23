from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Callable

from ..config import get_settings
from .base import AIProvider


class _Lazy:
    """Lazily construct a provider; defer build errors until the capability is actually used.

    Lets a user who only configured Bailian avoid filling in an OpenAI key just to start
    the app — the OpenAI provider is only constructed when audio is recorded.
    """

    def __init__(self, name: str, factory: Callable[[], AIProvider]) -> None:
        self._name = name
        self._factory = factory
        self._instance: AIProvider | None = None
        self._build_error: Exception | None = None

    def _get(self) -> AIProvider:
        if self._instance is not None:
            return self._instance
        if self._build_error is not None:
            raise self._build_error
        try:
            self._instance = self._factory()
            return self._instance
        except Exception as e:
            self._build_error = e
            raise

    @property
    def embedding_dim(self) -> int:
        try:
            return self._get().embedding_dim
        except Exception:
            return 0

    async def describe_image(self, image_path: Path, hint: str | None = None) -> str:
        return await self._get().describe_image(image_path, hint)

    async def transcribe_audio(self, audio_path: Path) -> str:
        return await self._get().transcribe_audio(audio_path)

    async def summarize_title(self, body: str) -> str:
        return await self._get().summarize_title(body)

    async def embed(self, text: str) -> list[float]:
        return await self._get().embed(text)


class CompositeProvider:
    """Routes each capability to its configured provider:
      - describe_image / summarize_title → primary
      - transcribe_audio → TRANSCRIBE_PROVIDER (default: openai)
      - embed → EMBEDDING_PROVIDER (default: openai)
    embedding_dim is taken from the embedder.
    """

    def __init__(
        self,
        primary: AIProvider,
        embedder: AIProvider | _Lazy,
        transcriber: AIProvider | _Lazy,
    ) -> None:
        self.primary = primary
        self.embedder = embedder
        self.transcriber = transcriber
        self.embedding_dim = embedder.embedding_dim

    async def describe_image(self, image_path: Path, hint: str | None = None) -> str:
        return await self.primary.describe_image(image_path, hint)

    async def transcribe_audio(self, audio_path: Path) -> str:
        return await self.transcriber.transcribe_audio(audio_path)

    async def summarize_title(self, body: str) -> str:
        return await self.primary.summarize_title(body)

    async def embed(self, text: str) -> list[float]:
        return await self.embedder.embed(text)


def _build(name: str) -> AIProvider:
    name = name.lower()
    if name == "claude":
        from .claude_provider import ClaudeProvider
        return ClaudeProvider()
    if name == "openai":
        from .openai_provider import OpenAIProvider
        return OpenAIProvider()
    if name == "gemini":
        from .gemini_provider import GeminiProvider
        return GeminiProvider()
    if name in ("bailian", "dashscope", "qwen"):
        from .bailian_provider import BailianProvider
        return BailianProvider()
    raise ValueError(f"Unknown AI provider: {name}")


# Providers without a native embedding capability
_NO_EMBED = {"claude"}
# Providers without native audio transcription
_NO_TRANSCRIBE = {"claude", "bailian", "dashscope", "qwen"}


@lru_cache
def get_provider() -> CompositeProvider:
    s = get_settings()
    primary_name = s.ai_provider.lower()
    primary = _build(primary_name)

    embed_name = s.embedding_provider.lower()
    if embed_name == "same":
        embed_name = primary_name
    if embed_name == primary_name and primary_name in _NO_EMBED:
        embed_name = "openai"  # forced fallback
    embedder: AIProvider | _Lazy = (
        primary if embed_name == primary_name else _Lazy(embed_name, lambda n=embed_name: _build(n))
    )

    trans_name = s.transcribe_provider.lower()
    if trans_name == "same":
        trans_name = primary_name
    if trans_name == primary_name and primary_name in _NO_TRANSCRIBE:
        trans_name = "openai"  # forced fallback
    transcriber: AIProvider | _Lazy = (
        primary if trans_name == primary_name else _Lazy(trans_name, lambda n=trans_name: _build(n))
    )

    return CompositeProvider(primary, embedder, transcriber)
