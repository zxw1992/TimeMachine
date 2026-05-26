from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# User-editable settings written by the in-app settings page. This JSON file
# lives in data/ (the backup unit) and is layered on top of .env, so .env keeps
# working as a first-run seed while the UI owns runtime changes.
OVERLAY_FILENAME = "settings.json"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ai_provider: str = "claude"

    anthropic_api_key: str = ""
    claude_vision_model: str = "claude-opus-4-7"
    claude_text_model: str = "claude-haiku-4-5-20251001"

    openai_api_key: str = ""
    openai_text_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"
    openai_whisper_model: str = "whisper-1"

    gemini_api_key: str = ""
    gemini_text_model: str = "gemini-2.0-flash"
    gemini_embedding_model: str = "text-embedding-004"

    # Alibaba Bailian (DashScope OpenAI-compatible mode)
    dashscope_api_key: str = ""
    dashscope_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    dashscope_text_model: str = "qwen-plus"
    dashscope_vision_model: str = "qwen-vl-plus"
    dashscope_embedding_model: str = "text-embedding-v3"
    dashscope_embedding_dim: int = 1024

    embedding_provider: str = "openai"
    transcribe_provider: str = "openai"

    # Whether the primary model suggests tags during ingestion (one extra, cheap
    # AI call per capture). Suggestions are proposed, never auto-applied.
    suggest_tags: bool = True

    # User-defined OpenAI-compatible providers, each:
    #   {id, label, base_url, api_key, text_model, vision_model,
    #    embedding_model, embedding_dim, transcribe_model, caps: [..]}
    # Populated from the settings overlay, not from .env.
    custom_providers: list[dict] = []

    data_dir: str = "./data"
    host: str = "127.0.0.1"
    port: int = 8000
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def data_path(self) -> Path:
        p = Path(self.data_dir)
        if not p.is_absolute():
            # Resolve relative to backend/ (parent of app/)
            p = Path(__file__).resolve().parent.parent / p
        p.mkdir(parents=True, exist_ok=True)
        (p / "uploads").mkdir(exist_ok=True)
        return p

    @property
    def db_path(self) -> Path:
        return self.data_path / "timemachine.db"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


def _overlay_path(base: Settings) -> Path:
    return base.data_path / OVERLAY_FILENAME


def _read_overlay(base: Settings) -> dict:
    path = _overlay_path(base)
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


@lru_cache
def get_settings() -> Settings:
    """Effective settings, resolved by layering (lowest → highest precedence):

        code defaults  <  .env / environment vars  <  data/settings.json

    The JSON overlay is written by the in-app settings page and only contains
    the fields the user actually changed; every other field falls through to
    .env / defaults. Because the overlay wins, a value set in the UI SHADOWS
    the same key in .env (the .env file is never modified). To make .env
    authoritative again, delete data/settings.json or change the value back in
    the UI. API keys live in the overlay in plaintext, same as .env.
    """
    base = Settings()  # .env + env vars + defaults
    overlay = _read_overlay(base)
    if not overlay:
        return base
    # Only apply keys that are real Settings fields.
    updates = {k: v for k, v in overlay.items() if k in Settings.model_fields}
    return base.model_copy(update=updates) if updates else base


def save_settings(updates: dict) -> Settings:
    """Merge `updates` into the overlay file and invalidate the cache.

    Only keys that map to Settings fields are persisted. Returns fresh settings.
    """
    base = Settings()
    path = _overlay_path(base)
    current = _read_overlay(base)
    for k, v in updates.items():
        if k in Settings.model_fields:
            current[k] = v
    path.write_text(
        json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    get_settings.cache_clear()
    return get_settings()
