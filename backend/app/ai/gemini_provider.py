from __future__ import annotations

import asyncio
from pathlib import Path

import google.generativeai as genai

from ..config import get_settings
from .base import IMAGE_PROMPT, SUMMARY_PROMPT


class GeminiProvider:
    def __init__(self) -> None:
        s = get_settings()
        if not s.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is empty")
        genai.configure(api_key=s.gemini_api_key)
        self.text_model_name = s.gemini_text_model
        self.embedding_model_name = s.gemini_embedding_model
        self.model = genai.GenerativeModel(self.text_model_name)
        self.embedding_dim = 768  # text-embedding-004

    async def describe_image(self, image_path: Path, hint: str | None = None) -> str:
        hint_block = f"\n用户补充上下文：{hint}" if hint else ""
        prompt = IMAGE_PROMPT.format(hint_block=hint_block)
        mime = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
        image_part = {"mime_type": mime, "data": image_path.read_bytes()}

        def _call() -> str:
            resp = self.model.generate_content([prompt, image_part])
            return (resp.text or "").strip()

        return await asyncio.to_thread(_call)

    async def transcribe_audio(self, audio_path: Path) -> str:
        def _call() -> str:
            mime = "audio/wav" if audio_path.suffix.lower() == ".wav" else "audio/mpeg"
            audio_part = {"mime_type": mime, "data": audio_path.read_bytes()}
            resp = self.model.generate_content(
                # Prompt in Chinese on purpose so transcription stays in Chinese
                # for the same reason the rest of the prompts are in Chinese.
                ["请将这段音频转写成中文文本，仅输出转写内容。", audio_part]
            )
            return (resp.text or "").strip()

        return await asyncio.to_thread(_call)

    async def summarize_title(self, body: str) -> str:
        prompt = SUMMARY_PROMPT.format(body=body[:2000])

        def _call() -> str:
            resp = self.model.generate_content(prompt)
            return (resp.text or "").strip().strip("「」\"'。.")

        title = await asyncio.to_thread(_call)
        return title[:30]

    async def embed(self, text: str) -> list[float]:
        def _call() -> list[float]:
            resp = genai.embed_content(
                model=self.embedding_model_name,
                content=text[:8000],
                task_type="retrieval_document",
            )
            return list(resp["embedding"])

        return await asyncio.to_thread(_call)
