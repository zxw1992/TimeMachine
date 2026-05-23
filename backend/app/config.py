from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


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


@lru_cache
def get_settings() -> Settings:
    return Settings()
