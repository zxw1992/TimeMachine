from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .ai.registry import startup_probe
from .config import get_settings
from .db import fail_stuck_entries, get_conn
from .logging_config import configure_logging, get_logger
from .routes import (
    entries,
    on_this_day,
    search,
    tags,
    timeline,
    transfer,
)
from .routes import (
    settings as settings_routes,
)

configure_logging()
log = get_logger(__name__)
settings = get_settings()

# Hold references to detached startup tasks so they aren't garbage-collected.
_startup_tasks: set[asyncio.Task] = set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("starting up · ai_provider=%s data_dir=%s", settings.ai_provider, settings.data_path)
    get_conn()  # Trigger schema initialization.
    stuck = fail_stuck_entries()  # Clean up entries orphaned by a previous restart.
    if stuck:
        log.warning("marked %d entry(ies) stuck mid-processing as failed", stuck)
    # Probe Bailian's region/key off the critical path so startup stays fast.
    task = asyncio.create_task(startup_probe())
    _startup_tasks.add(task)
    task.add_done_callback(_startup_tasks.discard)
    yield
    log.info("shutting down")


app = FastAPI(title="AI Time Machine", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(entries.router)
app.include_router(timeline.router)
app.include_router(search.router)
app.include_router(settings_routes.router)
app.include_router(on_this_day.router)
app.include_router(tags.router)
app.include_router(transfer.router)

# Serve uploaded files (image thumbnails, original audio) to the frontend.
app.mount("/files", StaticFiles(directory=str(settings.data_path)), name="files")


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "provider": settings.ai_provider}
