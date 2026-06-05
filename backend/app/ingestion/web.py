"""Fetch a web page and extract its readable article content.

Used by the "link" capture kind: the user drops a URL, we fetch the page and
pull out the main text + metadata so the AI can summarize and index it. Robust
fetching is the hard part — paywalls, login walls, and JS-rendered SPAs simply
can't be read server-side, so on any failure we raise a ValueError with a
user-facing (Chinese) message that points the user at the manual-paste fallback
(they can edit the entry and paste the text themselves).
"""

from __future__ import annotations

import asyncio
import json
from urllib.parse import urlparse, urlunparse

import httpx

from ..logging_config import get_logger

log = get_logger(__name__)

# A browser-like UA gets past the simplest bot filters; not a guarantee.
_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
)
_TIMEOUT = 20.0
# Cap the page we'll parse so a pathological response can't hang extraction.
_MAX_HTML_BYTES = 8_000_000


def normalize_url(raw: str) -> str:
    """Trim, add a scheme if missing, and validate it's an http(s) URL.

    Raises ValueError (user-facing zh) for empty / unsupported / malformed input.
    """
    raw = (raw or "").strip()
    if not raw:
        raise ValueError("缺少网页链接")
    parsed = urlparse(raw)
    if not parsed.scheme:  # "example.com/x" → assume https
        parsed = urlparse("https://" + raw)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("只支持 http / https 链接")
    if not parsed.netloc:
        raise ValueError("网页链接格式不正确")
    return urlunparse(parsed)


async def fetch_article(url: str) -> dict:
    """Fetch `url` and extract its main content.

    Returns a dict with keys: title, text, site, author, published, image,
    excerpt (any may be ""). Raises ValueError with a friendly zh message when
    the page can't be fetched or no readable text could be extracted.
    """
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=_TIMEOUT,
            headers={
                "User-Agent": _USER_AGENT,
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            },
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text[: _MAX_HTML_BYTES]
    except httpx.HTTPStatusError as e:
        code = e.response.status_code
        raise ValueError(
            f"抓取网页失败（HTTP {code}）。可能需要登录或被反爬拦截，可改为手动粘贴正文。"
        ) from e
    except httpx.InvalidURL as e:
        raise ValueError("网页链接格式不正确") from e
    except httpx.HTTPError as e:
        log.warning("link fetch failed for %s: %s", url, e)
        raise ValueError("抓取网页失败，请检查链接或网络后重试。") from e

    # Parsing is CPU-bound (lxml); keep it off the event loop.
    extracted = await asyncio.to_thread(_extract, html, url)
    if not extracted.get("text"):
        raise ValueError(
            "未能从网页中提取到正文（可能是付费墙或动态渲染页面），可改为手动粘贴正文。"
        )
    return extracted


def _extract(html: str, url: str) -> dict:
    """Run trafilatura on raw HTML and normalize its JSON into our field names."""
    import trafilatura

    raw = trafilatura.extract(
        html,
        url=url,
        output_format="json",
        include_comments=False,
        include_tables=True,
        with_metadata=True,
    )
    if not raw:
        return {}
    data = json.loads(raw)

    def s(*keys: str) -> str:
        for k in keys:
            v = data.get(k)
            if v:
                return str(v).strip()
        return ""

    return {
        "title": s("title"),
        "text": (data.get("text") or "").strip(),
        # Prefer a human site name (og:site_name), fall back to the domain.
        "site": s("sitename", "source-hostname", "hostname"),
        "author": s("author"),
        "published": s("date"),
        "image": s("image"),
        "excerpt": s("excerpt", "description"),
    }
