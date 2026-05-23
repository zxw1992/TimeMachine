from __future__ import annotations

from pathlib import Path
from typing import Protocol


class AIProvider(Protocol):
    embedding_dim: int

    async def describe_image(self, image_path: Path, hint: str | None = None) -> str: ...

    async def transcribe_audio(self, audio_path: Path) -> str: ...

    async def summarize_title(self, body: str) -> str: ...

    async def embed(self, text: str) -> list[float]: ...


# NOTE: These prompts are intentionally written in English as instructions to
# the model, but they ask the model to OUTPUT in the same language as the
# content. This makes titles/descriptions adapt to the user's language
# (Chinese in → Chinese out, English in → English out).
SUMMARY_PROMPT = (
    "You generate a title for an entry in a personal memory timeline. "
    "Based on the content below, write one concise title with no surrounding "
    "quotes and no trailing punctuation (about 12 words, or 20 characters for CJK). "
    "Write the title in the same language as the content.\n\nContent:\n{body}"
)

IMAGE_PROMPT = (
    "Look carefully at this image and write a concise but information-dense "
    "description (about 50-120 words, or 80-200 characters for CJK) covering: "
    "1) the main subject and scene; 2) any important text (preserve it verbatim if present); "
    "3) key objects / brands / people; 4) the mood or likely purpose. "
    "Write the description in the same language as the text shown in the image, "
    "or the language of the user's context note below; "
    "if neither is present, default to Chinese."
    "{hint_block}"
)
