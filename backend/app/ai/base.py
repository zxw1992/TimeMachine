from __future__ import annotations

import re
from pathlib import Path
from typing import Protocol


class AIProvider(Protocol):
    embedding_dim: int

    async def describe_image(self, image_path: Path, hint: str | None = None) -> str: ...

    async def transcribe_audio(self, audio_path: Path) -> str: ...

    async def summarize_title(self, body: str) -> str: ...

    async def summarize_article(self, text: str, lang: str = "zh") -> str: ...

    async def suggest_tags(self, body: str) -> list[str]: ...

    async def summarize_period(self, body: str) -> str: ...

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

# Unlike titles / image descriptions (which follow the content's own language),
# the article summary is a digest for the person browsing their timeline, so it
# follows the app's UI language (default Chinese). An English article then gets a
# Chinese summary up top, with the original English text preserved below it.
ARTICLE_PROMPT = (
    "You are summarizing a web article saved to someone's personal memory "
    "timeline, so they can recall what it said later without reopening the page. "
    "Write a faithful, self-contained summary of the article below: its main "
    "point, the key supporting ideas, and any important specifics (names, "
    "numbers, conclusions). Use 3-6 sentences (about 120-240 characters for CJK). "
    "No preamble like 'This article', no opinions of your own. Write the summary "
    "in {lang_name}, regardless of what language the article itself is in."
    "\n\nArticle:\n{body}"
)

_ARTICLE_LANG_NAMES = {"zh": "Chinese (简体中文)", "en": "English"}


def build_article_prompt(text: str, lang: str = "zh") -> str:
    """Render ARTICLE_PROMPT for a target UI language, truncating the input."""
    lang_name = _ARTICLE_LANG_NAMES.get((lang or "zh").lower(), _ARTICLE_LANG_NAMES["zh"])
    return ARTICLE_PROMPT.format(lang_name=lang_name, body=text[:6000])

TAGS_PROMPT = (
    "Suggest 3-5 short topical tags for the memory entry below, to help organize "
    "and find it later. Output ONLY the tags separated by commas — no numbering, "
    "no '#', no quotes, no extra text. Each tag is 1-3 words (2-6 characters for "
    "CJK). Write the tags in the same language as the content.\n\nContent:\n{body}"
)

# How many suggested tags we keep, and the max length of each.
MAX_SUGGESTED_TAGS = 5
_MAX_SUGGESTED_TAG_LEN = 24


def parse_suggested_tags(raw: str) -> list[str]:
    """Turn a model's free-form tag reply into a clean, capped, deduped list.

    Tolerant of commas (ASCII / fullwidth), the Chinese enumeration comma, and
    newlines as separators; strips leading '#', numbering, and surrounding
    quotes/brackets."""
    if not raw:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for piece in re.split(r"[,，、\n;；]+", raw):
        tag = re.sub(r"^\s*\d+[.)]\s*", "", piece)  # drop "1." / "2)" numbering
        tag = tag.strip(" \t'\"「」《》[]()-•*#").strip()
        tag = " ".join(tag.split())[:_MAX_SUGGESTED_TAG_LEN].strip()
        if not tag:
            continue
        key = tag.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(tag)
        if len(out) >= MAX_SUGGESTED_TAGS:
            break
    return out


REPORT_PROMPT = (
    "You are writing a warm, reflective review of a person's memory journal for "
    "one period (a week or a month). You are given the period's stats and its "
    "entries (date · title · short excerpt · tags).\n\n"
    "Write in the SAME LANGUAGE as the entries. Return ONLY a JSON object — no "
    "markdown fences, no text around it — with exactly these fields:\n"
    '- "headline": a short evocative title for the period (<=16 chars for CJK, '
    "<=8 words otherwise).\n"
    '- "narrative": 2-3 short paragraphs telling the story of the period — what '
    "the person focused on, recurring threads, the overall mood. Warm, personal, "
    'second person. Separate paragraphs with "\\n\\n".\n'
    '- "themes": an array of 3-6 short theme phrases (1-3 words each).\n'
    '- "highlight": one short standout line capturing a memorable moment.\n'
    '- "poster_svg": a single self-contained decorative SVG string for the '
    'period. Requirements: starts with "<svg" and uses viewBox="0 0 800 280"; '
    "NO <script>, <image>, <foreignObject>, or event handlers; only simple "
    "shapes, paths, gradients, and at most a few words of <text>. Use a warm "
    "paper palette — background #faf7f2, ink #2b2723, accent amber #c8862a, soft "
    "#e8d9c0. Keep it under 3000 characters, abstract and elegant. If you cannot, "
    'use an empty string.\n\n'
    "Period data:\n{body}"
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
