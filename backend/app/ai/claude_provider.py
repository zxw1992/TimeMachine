from __future__ import annotations

import base64
import mimetypes
from pathlib import Path

from anthropic import AsyncAnthropic

from ..config import get_settings
from .base import (
    IMAGE_PROMPT,
    REPORT_PROMPT,
    SUMMARY_PROMPT,
    TAGS_PROMPT,
    parse_suggested_tags,
)


class ClaudeProvider:
    """Claude handles vision and text summarization.

    Claude has no official embedding / audio transcription API; those capabilities
    fall back to OpenAIProvider via the registry's CompositeProvider.
    """

    def __init__(self) -> None:
        s = get_settings()
        if not s.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is empty")
        self.client = AsyncAnthropic(api_key=s.anthropic_api_key)
        self.vision_model = s.claude_vision_model
        self.text_model = s.claude_text_model
        # Real dim comes from the fallback embedder; placeholder here.
        self.embedding_dim = 0

    async def describe_image(self, image_path: Path, hint: str | None = None) -> str:
        mime, _ = mimetypes.guess_type(str(image_path))
        mime = mime or "image/png"
        data = base64.b64encode(image_path.read_bytes()).decode("ascii")
        hint_block = f"\n\nUser context: {hint}" if hint else ""
        prompt = IMAGE_PROMPT.format(hint_block=hint_block)
        msg = await self.client.messages.create(
            model=self.vision_model,
            max_tokens=500,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": mime,
                                "data": data,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        parts = [b.text for b in msg.content if getattr(b, "type", None) == "text"]
        return "".join(parts).strip()

    async def summarize_title(self, body: str) -> str:
        prompt = SUMMARY_PROMPT.format(body=body[:2000])
        msg = await self.client.messages.create(
            model=self.text_model,
            max_tokens=60,
            messages=[{"role": "user", "content": prompt}],
        )
        parts = [b.text for b in msg.content if getattr(b, "type", None) == "text"]
        title = "".join(parts).strip().strip("「」\"'。.")
        return title[:30]

    async def suggest_tags(self, body: str) -> list[str]:
        prompt = TAGS_PROMPT.format(body=body[:2000])
        msg = await self.client.messages.create(
            model=self.text_model,
            max_tokens=80,
            messages=[{"role": "user", "content": prompt}],
        )
        parts = [b.text for b in msg.content if getattr(b, "type", None) == "text"]
        return parse_suggested_tags("".join(parts))

    async def summarize_period(self, body: str) -> str:
        prompt = REPORT_PROMPT.format(body=body[:8000])
        msg = await self.client.messages.create(
            model=self.text_model,
            max_tokens=2500,
            messages=[{"role": "user", "content": prompt}],
        )
        parts = [b.text for b in msg.content if getattr(b, "type", None) == "text"]
        return "".join(parts)

    async def transcribe_audio(self, audio_path: Path) -> str:  # noqa: ARG002
        raise NotImplementedError("Claude has no native audio transcription; use OpenAI fallback")

    async def embed(self, text: str) -> list[float]:  # noqa: ARG002
        raise NotImplementedError("Claude has no native embedding API; use OpenAI fallback")
