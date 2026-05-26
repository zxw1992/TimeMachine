"""Settings API: read/write provider configuration from the frontend.

Security: API keys are NEVER returned to the client — only a boolean "is it
set". Writes accept partial updates; an empty key field means "leave it
unchanged" so the masked UI never wipes a stored key.
"""

from __future__ import annotations

from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import APIRouter, Body, HTTPException

from ..ai import registry
from ..config import get_settings, save_settings
from ..db import count_entries, get_conn, get_embedding_dim, rebuild_vec_table

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Which Settings fields belong to each built-in provider (key field first).
_BUILTIN_FIELDS: dict[str, dict] = {
    "claude": {
        "label": "Claude",
        "key": "anthropic_api_key",
        "models": ["claude_vision_model", "claude_text_model"],
    },
    "openai": {
        "label": "OpenAI",
        "key": "openai_api_key",
        "models": [
            "openai_text_model",
            "openai_embedding_model",
            "openai_whisper_model",
        ],
    },
    "gemini": {
        "label": "Gemini",
        "key": "gemini_api_key",
        "models": ["gemini_text_model", "gemini_embedding_model"],
    },
    "bailian": {
        "label": "Bailian / Qwen",
        "key": "dashscope_api_key",
        "models": [
            "dashscope_base_url",
            "dashscope_text_model",
            "dashscope_vision_model",
            "dashscope_embedding_model",
            "dashscope_embedding_dim",
        ],
    },
}

# Fields whose change requires a reindex once the embedding dim is locked.
_EMBEDDING_SENSITIVE = {
    "embedding_provider",
    "openai_embedding_model",
    "gemini_embedding_model",
    "dashscope_embedding_model",
    "dashscope_embedding_dim",
}


def _public_state() -> dict:
    s = get_settings()
    providers: dict[str, dict] = {}
    for name, spec in _BUILTIN_FIELDS.items():
        providers[name] = {
            "label": spec["label"],
            "caps": sorted(_caps(name)),
            "api_key_set": bool(getattr(s, spec["key"], "")),
            "models": {m: getattr(s, m, "") for m in spec["models"]},
        }

    customs = []
    for cp in s.custom_providers:
        c = dict(cp)
        c.pop("api_key", None)
        c["api_key_set"] = bool(cp.get("api_key"))
        customs.append(c)

    catalog = [
        {"id": name, "label": spec["label"], "caps": sorted(_caps(name))}
        for name, spec in _BUILTIN_FIELDS.items()
    ] + [
        {
            "id": cp.get("id"),
            "label": cp.get("label") or cp.get("id"),
            "caps": sorted(set(cp.get("caps") or [])),
        }
        for cp in s.custom_providers
    ]

    return {
        "ai_provider": s.ai_provider,
        "embedding_provider": s.embedding_provider,
        "transcribe_provider": s.transcribe_provider,
        "suggest_tags": s.suggest_tags,
        "providers": providers,
        "custom_providers": customs,
        "catalog": catalog,
        "embedding": {
            "locked_dim": get_embedding_dim(),
            "entry_count": count_entries(),
        },
    }


def _caps(name: str) -> set[str]:
    return {c for c in ("vision", "title", "embed", "transcribe") if registry.supports(name, c)}


def _reload_providers() -> None:
    registry.get_provider.cache_clear()


@router.get("")
async def read_settings() -> dict:
    return _public_state()


@router.put("")
async def update_settings(updates: dict = Body(...)) -> dict:
    s = get_settings()
    locked = get_embedding_dim() is not None and count_entries() > 0

    # Guard the embedding dim lock.
    if locked:
        for k in _EMBEDDING_SENSITIVE:
            if k in updates and updates[k] != getattr(s, k, None):
                raise HTTPException(
                    409,
                    "Changing the embedding model requires reindexing; "
                    "use the reindex action instead.",
                )

    clean = _sanitize_updates(updates, s)
    save_settings(clean)
    _reload_providers()
    return _public_state()


def _sanitize_updates(updates: dict, s) -> dict:
    clean: dict = {}
    for k, v in updates.items():
        # Empty key fields mean "keep the existing value".
        if k.endswith("api_key") and not v:
            continue
        if k == "custom_providers":
            clean[k] = _merge_custom_keys(v, s)
            continue
        clean[k] = v
    return clean


def _merge_custom_keys(incoming, s) -> list:
    """Preserve stored api_key for a custom provider when the client sends it
    back empty (masked)."""
    existing = {str(cp.get("id")): cp for cp in s.custom_providers}
    out = []
    for cp in incoming or []:
        cp = dict(cp)
        if not cp.get("api_key"):
            prev = existing.get(str(cp.get("id")))
            if prev and prev.get("api_key"):
                cp["api_key"] = prev["api_key"]
        out.append(cp)
    return out


@router.post("/test")
async def test_connection() -> dict:
    """Probe the currently saved provider config, capability by capability."""
    result: dict[str, dict] = {}
    try:
        provider = registry.get_provider()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"failed to build provider: {e}") from e

    # embed
    try:
        vec = await provider.embed("ping")
        result["embed"] = {"ok": True, "detail": f"dim={len(vec)}"}
    except Exception as e:  # noqa: BLE001
        result["embed"] = {"ok": False, "error": f"{type(e).__name__}: {e}"}

    # title (primary text)
    try:
        title = await provider.summarize_title("A quick note to verify the model responds.")
        result["title"] = {"ok": True, "detail": title}
    except Exception as e:  # noqa: BLE001
        result["title"] = {"ok": False, "error": f"{type(e).__name__}: {e}"}

    # vision (primary) — tiny generated image
    try:
        from PIL import Image, ImageDraw

        with NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            img = Image.new("RGB", (160, 90), (240, 245, 250))
            ImageDraw.Draw(img).text((10, 10), "test", fill=(20, 20, 20))
            img.save(tmp.name)
            tmp_path = Path(tmp.name)
        try:
            desc = await provider.describe_image(tmp_path, hint="connection test")
            result["vision"] = {"ok": True, "detail": desc[:120]}
        finally:
            tmp_path.unlink(missing_ok=True)
    except Exception as e:  # noqa: BLE001
        result["vision"] = {"ok": False, "error": f"{type(e).__name__}: {e}"}

    return {"results": result}


@router.post("/reindex")
async def reindex(payload: dict = Body(...)) -> dict:
    """Switch the embedding provider/model and re-embed every entry.

    All embeddings are computed before the vector table is rebuilt, so a failure
    leaves the existing index untouched (and we roll back the saved selection).
    """
    s = get_settings()
    # Snapshot the embedding-related selection for rollback.
    prev = {k: getattr(s, k, None) for k in _EMBEDDING_SENSITIVE}
    prev["custom_providers"] = [dict(cp) for cp in s.custom_providers]

    updates = _sanitize_updates(payload, s)
    save_settings(updates)
    _reload_providers()

    try:
        provider = registry.get_provider()
        conn = get_conn()
        rows = conn.execute("SELECT id, title, body FROM entries").fetchall()
        items: list[tuple[int, list[float]]] = []
        # Probe dim with the first real row (or a dummy) so an empty DB still relocks.
        probe_text = (
            f"{rows[0]['title'] or ''}\n{rows[0]['body']}" if rows else "probe"
        )
        dim = len(await provider.embed(probe_text))
        for r in rows:
            vec = await provider.embed(f"{r['title'] or ''}\n{r['body']}")
            if len(vec) != dim:
                raise RuntimeError("embedding returned inconsistent dimensions")
            items.append((r["id"], vec))
    except Exception as e:  # noqa: BLE001
        save_settings(prev)  # roll back the selection
        _reload_providers()
        raise HTTPException(502, f"reindex failed, settings rolled back: {e}") from e

    rebuild_vec_table(dim, items)
    return {"ok": True, "dim": dim, "count": len(items)}
