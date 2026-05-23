from __future__ import annotations

from pathlib import Path
from typing import Protocol


class AIProvider(Protocol):
    embedding_dim: int

    async def describe_image(self, image_path: Path, hint: str | None = None) -> str: ...

    async def transcribe_audio(self, audio_path: Path) -> str: ...

    async def summarize_title(self, body: str) -> str: ...

    async def embed(self, text: str) -> list[float]: ...


SUMMARY_PROMPT = (
    "你是一个为个人记忆时间线生成条目标题的助手。基于下面这段内容，"
    "生成一句简洁的中文标题，不超过20个字，不要加引号或标点结尾。\n\n内容：\n{body}"
)

IMAGE_PROMPT = (
    "请仔细观察这张图片，用中文写一段简洁但信息密集的描述（80-200字），覆盖以下要点："
    "1) 主体与场景；2) 重要文字（如有，原样保留）；3) 关键物体/品牌/人物；4) 氛围或可能的用途。"
    "{hint_block}"
)
