from __future__ import annotations

import asyncio
from pathlib import Path

import google.generativeai as genai

from ..config import get_settings
from .base import (
    IMAGE_PROMPT,
    REPORT_PROMPT,
    SUMMARY_PROMPT,
    TAGS_PROMPT,
    build_article_prompt,
    parse_suggested_tags,
)


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
        hint_block = f"\n\nUser context: {hint}" if hint else ""
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
                # Transcribe in whatever language is actually spoken.
                [
                    "Transcribe this audio verbatim in the language spoken. "
                    "Output only the transcription, with no extra commentary.",
                    audio_part,
                ]
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

    async def summarize_article(self, text: str, lang: str = "zh") -> str:
        prompt = build_article_prompt(text, lang)

        def _call() -> str:
            resp = self.model.generate_content(prompt)
            return (resp.text or "").strip()

        return await asyncio.to_thread(_call)

    async def suggest_tags(self, body: str) -> list[str]:
        prompt = TAGS_PROMPT.format(body=body[:2000])

        def _call() -> str:
            resp = self.model.generate_content(prompt)
            return (resp.text or "").strip()

        return parse_suggested_tags(await asyncio.to_thread(_call))

    async def summarize_period(self, body: str) -> str:
        prompt = REPORT_PROMPT.format(body=body[:8000])

        def _call() -> str:
            resp = self.model.generate_content(prompt)
            return resp.text or ""

        return await asyncio.to_thread(_call)

    async def embed(self, text: str) -> list[float]:
        def _call() -> list[float]:
            resp = genai.embed_content(
                model=self.embedding_model_name,
                content=text[:8000],
                task_type="retrieval_document",
            )
            return list(resp["embedding"])

        return await asyncio.to_thread(_call)
