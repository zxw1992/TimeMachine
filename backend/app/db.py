from __future__ import annotations

import sqlite3
import struct
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import sqlite_vec

from .config import get_settings

_EMBEDDING_DIM_KEY = "embedding_dim"


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


_conn: sqlite3.Connection | None = None


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        settings = get_settings()
        _conn = _connect(settings.db_path)
        _init_schema(_conn)
    return _conn


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def _init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS entries (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            occurred_at  TEXT NOT NULL,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            kind         TEXT NOT NULL,
            title        TEXT,
            body         TEXT NOT NULL,
            source_path  TEXT,
            meta_json    TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_entries_occurred_at ON entries(occurred_at);
        CREATE INDEX IF NOT EXISTS idx_entries_kind ON entries(kind);

        CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
            title, body, content='entries', content_rowid='id',
            tokenize='unicode61'
        );

        CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
            INSERT INTO entries_fts(rowid, title, body)
            VALUES (new.id, COALESCE(new.title, ''), new.body);
        END;
        CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
            INSERT INTO entries_fts(entries_fts, rowid, title, body)
            VALUES ('delete', old.id, COALESCE(old.title, ''), old.body);
        END;
        CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
            INSERT INTO entries_fts(entries_fts, rowid, title, body)
            VALUES ('delete', old.id, COALESCE(old.title, ''), old.body);
            INSERT INTO entries_fts(rowid, title, body)
            VALUES (new.id, COALESCE(new.title, ''), new.body);
        END;

        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        """
    )


def ensure_vec_table(dim: int) -> None:
    """Initialize the vec0 virtual table. The dimension is locked at first insertion."""
    conn = get_conn()
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (_EMBEDDING_DIM_KEY,)).fetchone()
    if row is None:
        conn.execute(
            f"CREATE VIRTUAL TABLE IF NOT EXISTS entries_vec USING vec0("
            f"entry_id INTEGER PRIMARY KEY, embedding FLOAT[{dim}])"
        )
        conn.execute(
            "INSERT INTO meta(key, value) VALUES(?, ?)",
            (_EMBEDDING_DIM_KEY, str(dim)),
        )
        conn.commit()
        return

    stored = int(row["value"])
    if stored != dim:
        raise RuntimeError(
            f"Embedding dim mismatch: db expects {stored} but provider returned {dim}. "
            "Run reindex if you changed embedding provider/model."
        )


def get_embedding_dim() -> int | None:
    conn = get_conn()
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (_EMBEDDING_DIM_KEY,)).fetchone()
    return int(row["value"]) if row else None


def count_entries() -> int:
    conn = get_conn()
    return int(conn.execute("SELECT COUNT(*) AS n FROM entries").fetchone()["n"])


def rebuild_vec_table(dim: int, items: list[tuple[int, list[float]]]) -> None:
    """Drop and recreate entries_vec at `dim`, refill it, and lock the new dim.

    Caller must compute all embeddings BEFORE invoking this, so the destructive
    drop only runs once the new vectors are known to be good.
    """
    with transaction() as conn:
        conn.execute("DROP TABLE IF EXISTS entries_vec")
        conn.execute(
            f"CREATE VIRTUAL TABLE entries_vec USING vec0("
            f"entry_id INTEGER PRIMARY KEY, embedding FLOAT[{dim}])"
        )
        conn.execute(
            "INSERT INTO meta(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (_EMBEDDING_DIM_KEY, str(dim)),
        )
        for entry_id, vec in items:
            conn.execute(
                "INSERT INTO entries_vec(entry_id, embedding) VALUES (?, ?)",
                (entry_id, serialize_vector(vec)),
            )


def serialize_vector(vec: list[float]) -> bytes:
    return struct.pack(f"{len(vec)}f", *vec)
