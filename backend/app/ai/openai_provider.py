from __future__ import annotations

import base64
import mimetypes
from pathlib import Path

from openai import AsyncOpenAI

from ..config import get_settings
from .base import IMAGE_PROMPT, SUMMARY_PROMPT


class OpenAIProvider:
    def __init__(self) -> None:
        s = get_settings()
        if not s.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is empty")
        self.client = AsyncOpenAI(api_key=s.openai_api_key)
        self.text_model = s.openai_text_model
        self.embedding_model = s.openai_embedding_model
        self.whisper_model = s.openai_whisper_model
        # text-embedding-3-small → 1536; -large → 3072
        self.embedding_dim = 1536 if "small" in self.embedding_model else 3072

    async def describe_image(self, image_path: Path, hint: str | None = None) -> str:
        mime, _ = mimetypes.guess_type(str(image_path))
        mime = mime or "image/png"
        data = base64.b64encode(image_path.read_bytes()).decode("ascii")
        hint_block = f"\n\nUser context: {hint}" if hint else ""
        prompt = IMAGE_PROMPT.format(hint_block=hint_block)
        resp = await self.client.chat.completions.create(
            model=self.text_model,
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

    async def transcribe_audio(self, audio_path: Path) -> str:
        with audio_path.open("rb") as f:
            resp = await self.client.audio.transcriptions.create(
                model=self.whisper_model,
                file=f,
            )
        return (resp.text or "").strip()

    async def summarize_title(self, body: str) -> str:
        prompt = SUMMARY_PROMPT.format(body=body[:2000])
        resp = await self.client.chat.completions.create(
            model=self.text_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=40,
        )
        title = (resp.choices[0].message.content or "").strip().strip("「」\"'。.")
        return title[:30]

    async def embed(self, text: str) -> list[float]:
        resp = await self.client.embeddings.create(
            model=self.embedding_model,
            input=text[:8000],
        )
        return resp.data[0].embedding
