from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def isolated_data(tmp_path, monkeypatch):
    """Point the app at a throwaway data dir and reset cached singletons.

    Each test gets a fresh SQLite db under tmp_path, so tests never touch the
    real data/ dir and can't see each other's rows.
    """
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))

    from app import config, db
    from app.ai import registry

    config.get_settings.cache_clear()
    registry.get_provider.cache_clear()
    if db._conn is not None:
        db._conn.close()
        db._conn = None

    yield

    if db._conn is not None:
        db._conn.close()
        db._conn = None
    config.get_settings.cache_clear()
    registry.get_provider.cache_clear()
