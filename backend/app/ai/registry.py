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


def _find_custom(name: str) -> dict | None:
    for cp in get_settings().custom_providers:
        if str(cp.get("id", "")).lower() == name:
            return cp
    return None


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
    cfg = _find_custom(name)
    if cfg is not None:
        from .openai_compatible_provider import OpenAICompatibleProvider
        return OpenAICompatibleProvider(cfg)
    raise ValueError(f"Unknown AI provider: {name}")


# Capabilities of the built-in providers.
_BUILTIN_CAPS: dict[str, set[str]] = {
    "claude": {"vision", "title"},
    "openai": {"vision", "title", "embed", "transcribe"},
    "gemini": {"vision", "title", "embed", "transcribe"},
    "bailian": {"vision", "title", "embed"},
}


def supports(name: str, cap: str) -> bool:
    """Whether provider `name` offers capability `cap`
    (vision / title / embed / transcribe)."""
    name = name.lower()
    if name in ("dashscope", "qwen"):
        name = "bailian"
    if name in _BUILTIN_CAPS:
        return cap in _BUILTIN_CAPS[name]
    cfg = _find_custom(name)
    if cfg is not None:
        return cap in set(cfg.get("caps") or [])
    return False


def _resolve_role(role_name: str, cap: str, primary_name: str) -> str:
    """Resolve the provider name for an embed/transcribe role, applying the
    'same' alias and forcing a fallback to openai when the choice can't do it."""
    name = role_name.lower()
    if name == "same":
        name = primary_name
    if not supports(name, cap):
        name = "openai"  # forced fallback to a capable built-in
    return name


async def startup_probe() -> None:
    """Best-effort check that a Bailian key matches its region endpoint.

    Bailian returns 401/403 when a key issued for one region (e.g. Beijing) is
    sent to another region's base_url. That failure otherwise only surfaces on
    the user's first capture; here we catch it at startup and print the fix.
    Only runs when Bailian is actually in use; never blocks or crashes startup.
    """
    s = get_settings()
    names = {
        s.ai_provider.lower(),
        s.embedding_provider.lower(),
        s.transcribe_provider.lower(),
    }
    if "same" in names:
        names.add(s.ai_provider.lower())
    if not names & {"bailian", "dashscope", "qwen"}:
        return

    try:
        from openai import AuthenticationError, PermissionDeniedError
    except ImportError:  # pragma: no cover - openai is a hard dep
        return

    try:
        from .bailian_provider import BailianProvider

        await BailianProvider().embed("ping")
    except (AuthenticationError, PermissionDeniedError):
        print(
            "⚠ Bailian (DashScope) rejected the API key (401/403). This usually "
            "means the key belongs to a different region than DASHSCOPE_BASE_URL.\n"
            "  Beijing    https://dashscope.aliyuncs.com/compatible-mode/v1\n"
            "  Singapore  https://dashscope-intl.aliyuncs.com/compatible-mode/v1\n"
            "  Virginia   https://dashscope-us.aliyuncs.com/compatible-mode/v1\n"
            "  Match DASHSCOPE_BASE_URL to the region where the key was created."
        )
    except Exception:
        # Offline, wrong model id, etc. — not a region problem, stay quiet.
        pass


@lru_cache
def get_provider() -> CompositeProvider:
    s = get_settings()
    primary_name = s.ai_provider.lower()
    primary = _build(primary_name)

    embed_name = _resolve_role(s.embedding_provider, "embed", primary_name)
    embedder: AIProvider | _Lazy = (
        primary if embed_name == primary_name else _Lazy(embed_name, lambda n=embed_name: _build(n))
    )

    trans_name = _resolve_role(s.transcribe_provider, "transcribe", primary_name)
    transcriber: AIProvider | _Lazy = (
        primary if trans_name == primary_name else _Lazy(trans_name, lambda n=trans_name: _build(n))
    )

    return CompositeProvider(primary, embedder, transcriber)
