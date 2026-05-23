"""End-to-end smoke test for the configured AI providers.

Tests each capability separately: embed / summarize_title / describe_image
/ (optional) transcribe_audio.

Usage:
  cd backend && uv run python smoke_test.py
  cd backend && uv run python smoke_test.py path/to/audio.m4a   # also test transcription
"""

from __future__ import annotations

import asyncio
import sys
import time
import traceback
from pathlib import Path

from PIL import Image, ImageDraw

from app.ai.registry import get_provider
from app.config import get_settings


def _make_test_image() -> Path:
    """Generate a 320x180 test image with shapes and text — easy to verify VLM is actually looking."""
    img = Image.new("RGB", (320, 180), (240, 245, 250))
    d = ImageDraw.Draw(img)
    d.rectangle((20, 20, 300, 160), outline=(80, 80, 200), width=3)
    d.ellipse((50, 50, 130, 130), fill=(255, 180, 60))
    d.text((150, 70), "AI Time Machine", fill=(20, 20, 20))
    d.text((150, 100), "测试图片 / smoke", fill=(20, 20, 20))
    path = Path("/tmp/aitm_smoke.png")
    img.save(path)
    return path


def _section(title: str) -> None:
    print(f"\n{'═' * 60}\n  {title}\n{'═' * 60}")


def _ok(label: str, detail: str = "", dt: float | None = None) -> None:
    tag = f" ({dt:.2f}s)" if dt is not None else ""
    print(f"  ✅ {label}{tag}")
    if detail:
        for line in detail.splitlines():
            print(f"     {line}")


def _fail(label: str, err: Exception) -> None:
    print(f"  ❌ {label}")
    print(f"     {type(err).__name__}: {err}")


async def run(audio_path: Path | None) -> None:
    settings = get_settings()
    _section("Current configuration")
    print(f"  AI_PROVIDER         = {settings.ai_provider}")
    print(f"  EMBEDDING_PROVIDER  = {settings.embedding_provider}")
    print(f"  TRANSCRIBE_PROVIDER = {settings.transcribe_provider}")
    print(f"  data_dir            = {settings.data_path}")

    try:
        p = get_provider()
    except Exception:
        _section("Failed to build provider")
        traceback.print_exc()
        return

    print(f"  primary     -> {type(p.primary).__name__}")
    print(f"  embedder    -> {type(p.embedder).__name__}  (dim={p.embedder.embedding_dim})")
    print(f"  transcriber -> {type(p.transcriber).__name__}")

    # 1. Embedding
    _section("1/4  Embedding")
    try:
        t0 = time.perf_counter()
        vec = await p.embed("今天试了一杯榛果拿铁，比上次甜一点")
        _ok("embed", f"dim={len(vec)}, first three components={vec[:3]}", time.perf_counter() - t0)
    except Exception as e:
        _fail("embed", e)

    # 2. Title summarization
    _section("2/4  Title summarization")
    try:
        t0 = time.perf_counter()
        title = await p.summarize_title(
            "下午在图书馆翻到一本关于二战时期密码学的书，作者很会讲故事，"
            "本来只是随手翻翻，结果一口气看了两章，决定借回家继续看。"
        )
        _ok("summarize_title", f"AI title: 「{title}」", time.perf_counter() - t0)
    except Exception as e:
        _fail("summarize_title", e)

    # 3. Vision
    _section("3/4  Image description")
    try:
        img_path = _make_test_image()
        t0 = time.perf_counter()
        desc = await p.describe_image(img_path, hint="这是一个测试图")
        _ok("describe_image", desc, time.perf_counter() - t0)
    except Exception as e:
        _fail("describe_image", e)

    # 4. Transcription (optional)
    _section("4/4  Audio transcription")
    if audio_path is None:
        print("  ⏭  No audio file passed. To test: uv run python smoke_test.py /path/to/voice.m4a")
    elif not audio_path.exists():
        print(f"  ❌ File not found: {audio_path}")
    else:
        try:
            t0 = time.perf_counter()
            text = await p.transcribe_audio(audio_path)
            _ok("transcribe_audio", text, time.perf_counter() - t0)
        except Exception as e:
            _fail("transcribe_audio", e)

    _section("Done")


if __name__ == "__main__":
    audio = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    asyncio.run(run(audio))
