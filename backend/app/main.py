from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .db import fail_stuck_entries, get_conn
from .routes import entries, search, settings as settings_routes, timeline

settings = get_settings()
app = FastAPI(title="AI Time Machine", version="0.1.0")

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

# Serve uploaded files (image thumbnails, original audio) to the frontend.
app.mount("/files", StaticFiles(directory=str(settings.data_path)), name="files")


@app.on_event("startup")
async def on_startup() -> None:
    get_conn()  # Trigger schema initialization.
    fail_stuck_entries()  # Clean up entries orphaned by a previous restart.


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "provider": settings.ai_provider}
