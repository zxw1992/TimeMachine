"""Central logging setup.

One place decides where logs go and at what level, so the rest of the code
just does `log = get_logger(__name__); log.info(...)`. We stay on the stdlib
(no extra dependency): a console stream plus two rotating files under
data/logs/ — app.log (everything at the configured level) and error.log
(WARNING and above), so problems are easy to find without scrolling.

Level is read from the LOG_LEVEL env var (default INFO).
"""

from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler

from .config import get_settings

_configured = False

_FMT = "%(asctime)s %(levelname)-7s %(name)s: %(message)s"
_MAX_BYTES = 2 * 1024 * 1024  # 2 MB per file
_BACKUPS = 3


def configure_logging() -> None:
    """Idempotently install console + file handlers on the root logger."""
    global _configured
    if _configured:
        return

    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    root = logging.getLogger()
    root.setLevel(level)

    fmt = logging.Formatter(_FMT)

    console = logging.StreamHandler()
    console.setLevel(level)
    console.setFormatter(fmt)
    root.addHandler(console)

    log_dir = get_settings().data_path / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    app_file = RotatingFileHandler(
        log_dir / "app.log", maxBytes=_MAX_BYTES, backupCount=_BACKUPS, encoding="utf-8"
    )
    app_file.setLevel(level)
    app_file.setFormatter(fmt)
    root.addHandler(app_file)

    error_file = RotatingFileHandler(
        log_dir / "error.log", maxBytes=_MAX_BYTES, backupCount=_BACKUPS, encoding="utf-8"
    )
    error_file.setLevel(logging.WARNING)
    error_file.setFormatter(fmt)
    root.addHandler(error_file)

    _configured = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
