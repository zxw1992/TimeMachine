"""Generic OpenAI-compatible provider.

Many services speak the OpenAI API with only a different base_url (Ollama,
DeepSeek, Moonshot, OpenRouter, Together, LM Studio, vLLM, …). This single
provider type covers all of them; users add one via the settings page by
filling in base_url + key + model IDs and ticking which capabilities it
supports.

Config dict shape (see Settings.custom_providers):
  {
    "id": "my-ollama", "label": "Local Ollama",
    "base_url": "http://localhost:11434/v1", "api_key": "ollama",
    "text_model": "...", "vision_model": "...",
    "embedding_model": "...", "embedding_dim": 768,
    "transcribe_model": "...", "caps": ["vision","title","embed","transcribe"]
  }
"""

from __future__ import annotations

import base64
import mimetypes
from pathlib import Path

from openai import AsyncOpenAI

from .base import IMAGE_PROMPT, SUMMARY_PROMPT, TAGS_PROMPT, parse_suggested_tags


class OpenAICompatibleProvider:
    def __init__(self, cfg: dict) -> None:
        base_url = (cfg.get("base_url") or "").strip()
        if not base_url:
            raise RuntimeError("custom provider is missing base_url")
        # Local servers (Ollama/LM Studio) often need a non-empty dummy key.
        api_key = (cfg.get("api_key") or "").strip() or "no-key"
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self.text_model = (cfg.get("text_model") or "").strip()
        self.vision_model = (cfg.get("vision_model") or "").strip() or self.text_model
        self.embedding_model = (cfg.get("embedding_model") or "").strip()
        self.transcribe_model = (cfg.get("transcribe_model") or "").strip()
        self.embedding_dim = int(cfg.get("embedding_dim") or 0)
        self.caps = set(cfg.get("caps") or [])

    async def describe_image(self, image_path: Path, hint: str | None = None) -> str:
        mime, _ = mimetypes.guess_type(str(image_path))
        mime = mime or "image/png"
        data = base64.b64encode(image_path.read_bytes()).decode("ascii")
        hint_block = f"\n\nUser context: {hint}" if hint else ""
        prompt = IMAGE_PROMPT.format(hint_block=hint_block)
        resp = await self.client.chat.completions.create(
            model=self.vision_model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{data}"},
                        },
                    ],
                }
            ],
            max_tokens=400,
        )
        return (resp.choices[0].message.content or "").strip()

    async def summarize_title(self, body: str) -> str:
        prompt = SUMMARY_PROMPT.format(body=body[:2000])
        resp = await self.client.chat.completions.create(
            model=self.text_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=40,
        )
        title = (resp.choices[0].message.content or "").strip().strip("「」\"'。.")
        return title[:30]

    async def suggest_tags(self, body: str) -> list[str]:
        prompt = TAGS_PROMPT.format(body=body[:2000])
        resp = await self.client.chat.completions.create(
            model=self.text_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=60,
        )
        return parse_suggested_tags(resp.choices[0].message.content or "")

    async def transcribe_audio(self, audio_path: Path) -> str:
        if "transcribe" not in self.caps or not self.transcribe_model:
            raise NotImplementedError(
                "this custom provider is not configured for transcription"
            )
        with audio_path.open("rb") as f:
            resp = await self.client.audio.transcriptions.create(
                model=self.transcribe_model,
                file=f,
            )
        return (resp.text or "").strip()

    async def embed(self, text: str) -> list[float]:
        resp = await self.client.embeddings.create(
            model=self.embedding_model,
            input=text[:8000],
        )
        return resp.data[0].embedding
