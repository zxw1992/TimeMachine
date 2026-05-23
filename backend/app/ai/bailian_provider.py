"""Alibaba Bailian (DashScope) provider.

Bailian exposes an OpenAI-compatible mode for chat completions and embeddings,
so we reuse the openai SDK and only swap base_url + model IDs.

Region base URLs:
  Beijing       https://dashscope.aliyuncs.com/compatible-mode/v1
  Singapore     https://dashscope-intl.aliyuncs.com/compatible-mode/v1
  Virginia      https://dashscope-us.aliyuncs.com/compatible-mode/v1

Model IDs and embedding dim are configured in .env — no allowlist in code.
Audio transcription: the compat mode does not support it; CompositeProvider
falls back to openai or gemini.
"""

from __future__ import annotations

import base64
import mimetypes
from pathlib import Path

from openai import AsyncOpenAI

from ..config import get_settings
from .base import IMAGE_PROMPT, SUMMARY_PROMPT


class BailianProvider:
    def __init__(self) -> None:
        s = get_settings()
        if not s.dashscope_api_key:
            raise RuntimeError("DASHSCOPE_API_KEY is empty")
        self.client = AsyncOpenAI(
            api_key=s.dashscope_api_key,
            base_url=s.dashscope_base_url,
        )
        self.text_model = s.dashscope_text_model
        self.vision_model = s.dashscope_vision_model
        self.embedding_model = s.dashscope_embedding_model
        self.embedding_dim = s.dashscope_embedding_dim

    async def describe_image(self, image_path: Path, hint: str | None = None) -> str:
        mime, _ = mimetypes.guess_type(str(image_path))
        mime = mime or "image/png"
        data = base64.b64encode(image_path.read_bytes()).decode("ascii")
        hint_block = f"\n用户补充上下文：{hint}" if hint else ""
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

    async def transcribe_audio(self, audio_path: Path) -> str:  # noqa: ARG002
        raise NotImplementedError(
            "Bailian compat mode does not support audio transcription; "
            "set TRANSCRIBE_PROVIDER to openai or gemini"
        )

    async def embed(self, text: str) -> list[float]:
        # Bailian text-embedding-v3 / v4 via the OpenAI-compat /embeddings endpoint.
        resp = await self.client.embeddings.create(
            model=self.embedding_model,
            input=text[:8000],
        )
        return resp.data[0].embedding
