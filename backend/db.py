"""Postgres persistence layer for parsed roster / schedule / chart payloads.

Introduced v3.22 to take the heavy PDF parses off the user request hot path.
Today the per-driver request `POST /api/parse-fortnight-roster` takes ~3 min 39 s
on Render free tier and fully blocks the single uvicorn worker (see the v3.21
load-test results in `loadtest/RESULTS.md`).  The fix is to have the admin
parse a PDF *once*, persist the parsed JSON to Postgres, and have every driver
read from Postgres on app-load.

Connection is created lazily on first use; if `DATABASE_URL` is unset (typical
on a developer laptop or in a CI environment without a real DB), every storage
call short-circuits to a no-op and the public read endpoints return 404.  This
keeps `pytest` and `uvicorn --reload` working out of the box without requiring
contributors to spin up Postgres locally.

PRD ref: §6.12 (server-side persistence, v3.22).
"""
from __future__ import annotations
import json
import os
from typing import Any, Optional

try:
    import asyncpg
except ImportError:                                   # pragma: no cover
    asyncpg = None                                    # type: ignore

# ─── Connection lifecycle ───────────────────────────────────────────────────

_POOL: Optional["asyncpg.Pool"] = None
_INITIALISED = False


def _database_url() -> Optional[str]:
    """Return DATABASE_URL from env, or None if unset / empty.

    Neon-on-Vercel injects this automatically when the integration is installed;
    on Render the value must be copy-pasted into the service's env vars (Vercel
    and Render are separate platforms — env vars do not cross-wire)."""
    url = (os.environ.get("DATABASE_URL") or "").strip()
    return url or None


async def get_pool() -> Optional["asyncpg.Pool"]:
    """Lazily create the asyncpg pool.  Returns None if no DB configured.

    Pool size kept small (min=1, max=4) because Render free tier worker is a
    single uvicorn process; larger pools just waste connection slots on the
    free Neon tier (which limits concurrent connections)."""
    global _POOL, _INITIALISED
    if asyncpg is None:                               # asyncpg not installed
        return None
    url = _database_url()
    if not url:                                       # no DB configured
        return None
    if _POOL is None:
        _POOL = await asyncpg.create_pool(
            url,
            min_size=1,
            max_size=4,
            command_timeout=30,
        )
    if not _INITIALISED:
        await _ensure_schema(_POOL)
        _INITIALISED = True
    return _POOL


async def close_pool() -> None:
    """Close the pool on app shutdown (called by FastAPI lifespan)."""
    global _POOL, _INITIALISED
    if _POOL is not None:
        await _POOL.close()
        _POOL = None
        _INITIALISED = False


# ─── Schema ─────────────────────────────────────────────────────────────────

# Single table for every parsed artifact type.  Kept deliberately simple — one
# row per upload, the latest active row per `kind` is what callers consume.
# `payload` is JSONB so any Pydantic response model serialises straight in.
#
# `active` is a soft-delete flag: setting it false on the old row when a new
# upload arrives keeps full history without complicating reads.
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS parsed_artifact (
    id           BIGSERIAL PRIMARY KEY,
    kind         TEXT       NOT NULL,
    sub_kind     TEXT,
    source_file  TEXT       NOT NULL,
    uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by  TEXT,
    payload      JSONB      NOT NULL,
    active       BOOLEAN    NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_kind CHECK (kind IN (
        'master_roster', 'fortnight_roster',
        'schedule', 'assoc_chart'
    ))
);

CREATE INDEX IF NOT EXISTS idx_parsed_artifact_lookup
    ON parsed_artifact (kind, sub_kind, active, uploaded_at DESC);
"""


async def _ensure_schema(pool: "asyncpg.Pool") -> None:
    """Run the schema DDL idempotently on first connect."""
    async with pool.acquire() as conn:
        await conn.execute(SCHEMA_SQL)


# ─── CRUD ───────────────────────────────────────────────────────────────────

# Valid `kind` values — kept in sync with the CHECK constraint above.
KINDS = {"master_roster", "fortnight_roster", "schedule", "assoc_chart"}


async def save_artifact(
    kind: str,
    payload: dict[str, Any],
    source_file: str,
    sub_kind: Optional[str] = None,
    uploaded_by: Optional[str] = None,
) -> Optional[int]:
    """Insert a new parsed artifact and mark prior versions inactive.

    Returns the new row id, or None if no DB is configured (no-op fallback).

    The (kind, sub_kind) pair identifies the slot: e.g.
        kind='schedule', sub_kind='weekday'   ← all weekday schedules share a slot
        kind='schedule', sub_kind='weekend'   ← weekend slot
        kind='master_roster', sub_kind=None
    Only the latest active row per slot is what `get_latest_artifact` returns;
    old rows stay around for audit history."""
    if kind not in KINDS:
        raise ValueError(f"invalid kind {kind!r}; expected one of {sorted(KINDS)}")
    pool = await get_pool()
    if pool is None:
        return None
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Soft-delete prior active rows for this slot.
            await conn.execute(
                """
                UPDATE parsed_artifact
                   SET active = FALSE
                 WHERE kind = $1
                   AND sub_kind IS NOT DISTINCT FROM $2
                   AND active = TRUE
                """,
                kind, sub_kind,
            )
            row = await conn.fetchrow(
                """
                INSERT INTO parsed_artifact
                    (kind, sub_kind, source_file, uploaded_by, payload, active)
                VALUES ($1, $2, $3, $4, $5::jsonb, TRUE)
                RETURNING id
                """,
                kind, sub_kind, source_file, uploaded_by,
                json.dumps(payload),
            )
            return int(row["id"]) if row else None


async def get_latest_artifact(
    kind: str,
    sub_kind: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Return the latest active payload for the (kind, sub_kind) slot.

    Returns None if no DB is configured OR no upload has happened yet.
    Callers should treat None as 'no data yet' and respond with 404 to the user."""
    if kind not in KINDS:
        raise ValueError(f"invalid kind {kind!r}; expected one of {sorted(KINDS)}")
    pool = await get_pool()
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT payload, source_file, uploaded_at, id
              FROM parsed_artifact
             WHERE kind = $1
               AND sub_kind IS NOT DISTINCT FROM $2
               AND active = TRUE
             ORDER BY uploaded_at DESC
             LIMIT 1
            """,
            kind, sub_kind,
        )
    if row is None:
        return None
    return {
        "id": int(row["id"]),
        "source_file": row["source_file"],
        "uploaded_at": row["uploaded_at"].isoformat(),
        "payload": json.loads(row["payload"]) if isinstance(row["payload"], str) else row["payload"],
    }
