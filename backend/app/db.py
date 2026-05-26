from __future__ import annotations

import sqlite3
import struct
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

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
        _migrate(_conn)
    return _conn


def _migrate(conn: sqlite3.Connection) -> None:
    """Lightweight in-place migrations for DBs created before a column existed."""
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(entries)").fetchall()}
    if "status" not in cols:
        conn.execute("ALTER TABLE entries ADD COLUMN status TEXT NOT NULL DEFAULT 'done'")
        conn.commit()
    if "favorite" not in cols:
        conn.execute("ALTER TABLE entries ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0")
        conn.commit()

    # An earlier experiment shipped a different `entry_tags` shape
    # (entry_id, tag, source). If we find that legacy table, carry any rows over
    # to the normalized join (tags + entry_tags(entry_id, tag_id)) and rebuild.
    et_cols = {r["name"] for r in conn.execute("PRAGMA table_info(entry_tags)").fetchall()}
    if et_cols and "tag_id" not in et_cols:
        legacy = conn.execute("SELECT entry_id, tag FROM entry_tags").fetchall()
        conn.executescript("DROP TABLE entry_tags; DROP TABLE IF EXISTS tags;")
        conn.commit()
        _init_schema(conn)  # recreate `tags` + `entry_tags` with the right schema
        for r in legacy:
            conn.execute("INSERT OR IGNORE INTO tags(name) VALUES (?)", (r["tag"],))
            tid = conn.execute(
                "SELECT id FROM tags WHERE name = ? COLLATE NOCASE", (r["tag"],)
            ).fetchone()["id"]
            conn.execute(
                "INSERT OR IGNORE INTO entry_tags(entry_id, tag_id) VALUES (?, ?)",
                (r["entry_id"], tid),
            )
        conn.commit()


def update_entry_status(entry_id: int, status: str) -> None:
    with transaction() as conn:
        conn.execute("UPDATE entries SET status = ? WHERE id = ?", (status, entry_id))


# ───────────────────────── Tags & favorites ─────────────────────────

_MAX_TAGS_PER_ENTRY = 20
_MAX_TAG_LEN = 50


def normalize_tags(names: list[str]) -> list[str]:
    """Trim, collapse whitespace, truncate, dedupe (case-insensitive), and cap
    the count. Preserves the first-seen casing of each tag."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in names:
        name = " ".join((raw or "").split())[:_MAX_TAG_LEN].strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
        if len(out) >= _MAX_TAGS_PER_ENTRY:
            break
    return out


def get_entry_tags(entry_id: int) -> list[str]:
    rows = get_conn().execute(
        "SELECT t.name AS name FROM tags t "
        "JOIN entry_tags et ON et.tag_id = t.id "
        "WHERE et.entry_id = ? ORDER BY t.name COLLATE NOCASE",
        (entry_id,),
    ).fetchall()
    return [r["name"] for r in rows]


def get_tags_for_entries(entry_ids: list[int]) -> dict[int, list[str]]:
    """Batch-fetch tags for many entries at once (avoids N+1 on the timeline)."""
    if not entry_ids:
        return {}
    placeholders = ",".join("?" * len(entry_ids))
    rows = get_conn().execute(
        f"SELECT et.entry_id AS eid, t.name AS name "
        f"FROM entry_tags et JOIN tags t ON t.id = et.tag_id "
        f"WHERE et.entry_id IN ({placeholders}) "
        f"ORDER BY t.name COLLATE NOCASE",
        entry_ids,
    ).fetchall()
    result: dict[int, list[str]] = {}
    for r in rows:
        result.setdefault(r["eid"], []).append(r["name"])
    return result


def set_entry_tags(entry_id: int, names: list[str]) -> list[str]:
    """Replace an entry's tags with the normalized `names`. Returns the tags as
    stored. Unreferenced tag rows are purged so the dictionary stays clean."""
    norm = normalize_tags(names)
    with transaction() as conn:
        conn.execute("DELETE FROM entry_tags WHERE entry_id = ?", (entry_id,))
        for name in norm:
            conn.execute("INSERT OR IGNORE INTO tags(name) VALUES (?)", (name,))
            row = conn.execute(
                "SELECT id FROM tags WHERE name = ? COLLATE NOCASE", (name,)
            ).fetchone()
            conn.execute(
                "INSERT OR IGNORE INTO entry_tags(entry_id, tag_id) VALUES (?, ?)",
                (entry_id, row["id"]),
            )
        _purge_orphan_tags(conn)
    return norm


def set_favorite(entry_id: int, fav: bool) -> None:
    with transaction() as conn:
        conn.execute(
            "UPDATE entries SET favorite = ? WHERE id = ?", (1 if fav else 0, entry_id)
        )


def list_all_tags() -> list[dict]:
    """All tags in use, with their entry counts, most-used first."""
    rows = get_conn().execute(
        "SELECT t.name AS name, COUNT(et.entry_id) AS count "
        "FROM tags t JOIN entry_tags et ON et.tag_id = t.id "
        "GROUP BY t.id ORDER BY count DESC, t.name COLLATE NOCASE"
    ).fetchall()
    return [{"name": r["name"], "count": r["count"]} for r in rows]


def _purge_orphan_tags(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM entry_tags)")


# ───────────────────────── Reports ─────────────────────────


def get_report(kind: str, period_key: str) -> dict | None:
    row = get_conn().execute(
        "SELECT payload, entry_count, created_at FROM reports "
        "WHERE kind = ? AND period_key = ?",
        (kind, period_key),
    ).fetchone()
    return dict(row) if row else None


def upsert_report(
    kind: str,
    period_key: str,
    period_start: str,
    period_end: str,
    entry_count: int,
    payload: str,
) -> None:
    """Store (or replace) the cached AI report for a period."""
    with transaction() as conn:
        conn.execute(
            "INSERT INTO reports(kind, period_key, period_start, period_end, "
            "entry_count, payload, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, datetime('now')) "
            "ON CONFLICT(kind, period_key) DO UPDATE SET "
            "period_start=excluded.period_start, period_end=excluded.period_end, "
            "entry_count=excluded.entry_count, payload=excluded.payload, "
            "created_at=excluded.created_at",
            (kind, period_key, period_start, period_end, entry_count, payload),
        )


def fail_stuck_entries() -> int:
    """Mark entries left mid-processing (e.g. by a server restart) as 'error'.

    Their background task is gone and can't be resumed, so flag them so the UI
    can show a failure instead of an eternal spinner. Returns how many."""
    with transaction() as conn:
        cur = conn.execute(
            "UPDATE entries SET status = 'error' "
            "WHERE status NOT IN ('done', 'error')"
        )
        return cur.rowcount


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
            meta_json    TEXT,
            status       TEXT NOT NULL DEFAULT 'done',
            favorite     INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_entries_occurred_at ON entries(occurred_at);
        CREATE INDEX IF NOT EXISTS idx_entries_kind ON entries(kind);

        -- Tags are normalized: a `tags` dictionary + an `entry_tags` join.
        -- Names are unique case-insensitively; deleting an entry cascades to
        -- its links (orphaned tag rows are purged separately).
        CREATE TABLE IF NOT EXISTS tags (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE
        );
        CREATE TABLE IF NOT EXISTS entry_tags (
            entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
            tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (entry_id, tag_id)
        );
        CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(tag_id);

        -- Cached AI review reports, one row per (kind, period). `payload` holds
        -- the generated JSON (headline / narrative / themes / highlight / svg).
        CREATE TABLE IF NOT EXISTS reports (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            kind         TEXT NOT NULL,
            period_key   TEXT NOT NULL,
            period_start TEXT NOT NULL,
            period_end   TEXT NOT NULL,
            entry_count  INTEGER NOT NULL DEFAULT 0,
            payload      TEXT NOT NULL,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (kind, period_key)
        );

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
