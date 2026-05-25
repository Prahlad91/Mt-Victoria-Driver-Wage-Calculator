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
        # statement_cache_size=0 — Neon's default DATABASE_URL is a PgBouncer
        # transaction-level pooled connection that doesn't support PostgreSQL
        # server-side prepared statements.  Disabling asyncpg's statement cache
        # makes this code work transparently with either the pooled URL or the
        # unpooled DATABASE_URL_UNPOOLED.  Performance cost is negligible for
        # our workload (few writes, sub-100-row reads).
        _POOL = await asyncpg.create_pool(
            url,
            min_size=1,
            max_size=4,
            command_timeout=30,
            statement_cache_size=0,
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

-- v3.31: allowlist of employee IDs that can log in to the driver view.
-- Each row represents one authorized driver; admin manages via the "Drivers"
-- admin tab.  No password / PIN field — the 8-digit employee ID is the sole
-- credential (per the chosen B2C model where sharing is an acceptable risk).
CREATE TABLE IF NOT EXISTS allowed_employees (
    id              BIGSERIAL PRIMARY KEY,
    employee_id     VARCHAR(8) NOT NULL UNIQUE,
    label           TEXT,
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until    TIMESTAMPTZ,
    failed_attempts INT        NOT NULL DEFAULT 0,
    last_failed_at  TIMESTAMPTZ,
    last_login_at   TIMESTAMPTZ,
    CONSTRAINT chk_employee_id_format CHECK (employee_id ~ '^[0-9]{8}$')
);

CREATE INDEX IF NOT EXISTS idx_allowed_employees_employee_id
    ON allowed_employees (employee_id);

-- v3.31: audit log of every login attempt.  Used for IP rate-limit,
-- per-ID lockout policy, and admin visibility into login patterns.
-- Rows older than 30 days are opportunistically deleted on login attempts
-- (1% probability per attempt, dispatched as a background task so the
-- login response isn't delayed).
CREATE TABLE IF NOT EXISTS login_audit (
    id           BIGSERIAL PRIMARY KEY,
    employee_id  TEXT NOT NULL,
    ip_address   TEXT,
    user_agent   TEXT,
    result       TEXT NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_audit_result CHECK (result IN (
        'success',
        'failed_invalid_format',
        'failed_not_allowlisted',
        'failed_locked',
        'failed_rate_limited_ip'
    ))
);

CREATE INDEX IF NOT EXISTS idx_login_audit_employee_id_time
    ON login_audit (employee_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_audit_ip_time
    ON login_audit (ip_address, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_audit_attempted_at
    ON login_audit (attempted_at);
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
    scope_by_uploader: bool = False,
) -> Optional[int]:
    """Insert a new parsed artifact and mark prior versions inactive.

    Returns the new row id, or None if no DB is configured (no-op fallback).

    The (kind, sub_kind) pair identifies the slot:
        kind='schedule', sub_kind='weekday'   ← all weekday schedules share a slot
        kind='schedule', sub_kind='weekend'   ← weekend slot
        kind='master_roster', sub_kind=None
        kind='fortnight_roster', sub_kind=None — but scoped per uploader (v3.23)

    `scope_by_uploader=True` (used for fortnight_roster per v3.23): the soft-delete
    of prior active rows is filtered to `uploaded_by = <session_id>` so each user
    only replaces their OWN previous upload, not someone else's.  `uploaded_by`
    must be non-empty when scope_by_uploader is True (raises ValueError otherwise).

    `scope_by_uploader=False` (admin globals): all prior active rows for the slot
    are soft-deleted, so the new upload becomes the single global source of truth.
    """
    if kind not in KINDS:
        raise ValueError(f"invalid kind {kind!r}; expected one of {sorted(KINDS)}")
    if scope_by_uploader and not uploaded_by:
        raise ValueError("scope_by_uploader=True requires a non-empty uploaded_by")
    pool = await get_pool()
    if pool is None:
        return None
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Soft-delete prior active rows for this slot.  Optionally scope to
            # the same uploader so other users' rows are untouched.
            if scope_by_uploader:
                await conn.execute(
                    """
                    UPDATE parsed_artifact
                       SET active = FALSE
                     WHERE kind = $1
                       AND sub_kind IS NOT DISTINCT FROM $2
                       AND uploaded_by = $3
                       AND active = TRUE
                    """,
                    kind, sub_kind, uploaded_by,
                )
            else:
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
    uploaded_by: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Return the latest active payload for the (kind, sub_kind[, uploaded_by]) slot.

    `uploaded_by` is optional.  When provided, only rows uploaded by that
    identifier are returned (used for per-user fortnight rosters per v3.23).
    When None, the query is unscoped (used for admin globals).

    Returns None if no DB is configured OR no matching upload exists.
    Callers should treat None as 'no data yet' and respond with 404."""
    if kind not in KINDS:
        raise ValueError(f"invalid kind {kind!r}; expected one of {sorted(KINDS)}")
    pool = await get_pool()
    if pool is None:
        return None
    async with pool.acquire() as conn:
        if uploaded_by is not None:
            row = await conn.fetchrow(
                """
                SELECT payload, source_file, uploaded_at, id
                  FROM parsed_artifact
                 WHERE kind = $1
                   AND sub_kind IS NOT DISTINCT FROM $2
                   AND uploaded_by = $3
                   AND active = TRUE
                 ORDER BY uploaded_at DESC
                 LIMIT 1
                """,
                kind, sub_kind, uploaded_by,
            )
        else:
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


# ─── v3.31: Auth allowlist + audit-log CRUD ─────────────────────────────────

import re as _re
from datetime import datetime as _dt, timedelta as _td, timezone as _tz

EMP_ID_RE = _re.compile(r"^[0-9]{8}$")

# Policy constants — referenced by main.py login endpoint.
RATE_LIMIT_IP_HOUR = 5      # max failed attempts per IP per hour
LOCKOUT_FAILS_24H  = 10     # failed attempts on a specific ID within 24h
LOCKOUT_DURATION_H = 24     # how long the ID stays locked
AUDIT_RETENTION_DAYS = 30   # rows older than this are eligible for cleanup


async def list_allowed_employees() -> list[dict[str, Any]]:
    """Return all allowlisted drivers + their lockout/login status, newest first.
    Admin reads this to populate the Drivers tab."""
    pool = await get_pool()
    if pool is None:
        return []
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT employee_id, label, created_by, created_at,
                   locked_until, failed_attempts, last_failed_at, last_login_at
              FROM allowed_employees
             ORDER BY created_at DESC
        """)
    return [_row_to_dict(r) for r in rows]


async def get_employee(employee_id: str) -> Optional[dict[str, Any]]:
    """Look up one allowlisted employee, or return None if not allowlisted."""
    pool = await get_pool()
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT employee_id, label, locked_until, failed_attempts,"
            "       last_failed_at, last_login_at, created_at"
            "  FROM allowed_employees WHERE employee_id = $1",
            employee_id,
        )
    return _row_to_dict(row) if row else None


async def add_allowed_employee(
    employee_id: str, label: Optional[str], created_by: Optional[str],
) -> bool:
    """Add an employee ID to the allowlist.  Returns True if inserted, False
    if the ID already exists (no error — idempotent at the API layer)."""
    if not EMP_ID_RE.match(employee_id):
        raise ValueError("employee_id must be 8 digits")
    pool = await get_pool()
    if pool is None:
        return False
    async with pool.acquire() as conn:
        try:
            await conn.execute(
                """INSERT INTO allowed_employees (employee_id, label, created_by)
                   VALUES ($1, $2, $3)""",
                employee_id, label, created_by,
            )
            return True
        except Exception:
            return False  # duplicate or constraint violation


async def remove_allowed_employee(employee_id: str) -> bool:
    """Remove an employee from the allowlist.  Returns True if a row was
    deleted.  Their audit-log history is intentionally preserved."""
    pool = await get_pool()
    if pool is None:
        return False
    async with pool.acquire() as conn:
        r = await conn.execute(
            "DELETE FROM allowed_employees WHERE employee_id = $1",
            employee_id,
        )
        return r.endswith(" 1")


async def unlock_employee(employee_id: str) -> bool:
    """Admin action: clear an employee's lockout + failure counter so they
    can log in immediately.  Returns True if a row was updated."""
    pool = await get_pool()
    if pool is None:
        return False
    async with pool.acquire() as conn:
        r = await conn.execute(
            """UPDATE allowed_employees
                  SET locked_until = NULL,
                      failed_attempts = 0,
                      last_failed_at = NULL
                WHERE employee_id = $1""",
            employee_id,
        )
        return r.endswith(" 1")


async def mark_login_success(employee_id: str) -> None:
    """Reset failure counter + update last_login_at on a successful login."""
    pool = await get_pool()
    if pool is None:
        return
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE allowed_employees
                  SET failed_attempts = 0,
                      last_failed_at = NULL,
                      locked_until = NULL,
                      last_login_at = NOW()
                WHERE employee_id = $1""",
            employee_id,
        )


async def increment_failed_attempts(employee_id: str) -> dict[str, Any]:
    """Increment the failed-attempt counter on an allowlisted ID.  If the
    24-h window crossed `LOCKOUT_FAILS_24H`, set `locked_until` to NOW +
    `LOCKOUT_DURATION_H` hours.  Returns the updated row.  No-op if the
    employee_id isn't in the allowlist."""
    pool = await get_pool()
    if pool is None:
        return {}
    locked_until = _dt.now(_tz.utc) + _td(hours=LOCKOUT_DURATION_H)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """UPDATE allowed_employees
                  SET failed_attempts = failed_attempts + 1,
                      last_failed_at  = NOW(),
                      locked_until    = CASE
                          WHEN failed_attempts + 1 >= $2 THEN $3::timestamptz
                          ELSE locked_until
                      END
                WHERE employee_id = $1
            RETURNING employee_id, failed_attempts, locked_until""",
            employee_id, LOCKOUT_FAILS_24H, locked_until,
        )
    return _row_to_dict(row) if row else {}


async def record_login_attempt(
    employee_id: str, ip: Optional[str], ua: Optional[str], result: str,
) -> None:
    """Append a row to the audit log.  Returns None.  Safe to call even
    when no DB is configured (no-op)."""
    pool = await get_pool()
    if pool is None:
        return
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO login_audit (employee_id, ip_address, user_agent, result)
               VALUES ($1, $2, $3, $4)""",
            employee_id, ip, ua, result,
        )


async def count_recent_ip_failures(ip: Optional[str], hours: int = 1) -> int:
    """Count failed attempts from this IP within the rolling window.  Used
    by the login endpoint's rate-limit gate."""
    if not ip:
        return 0
    pool = await get_pool()
    if pool is None:
        return 0
    since = _dt.now(_tz.utc) - _td(hours=hours)
    async with pool.acquire() as conn:
        n = await conn.fetchval(
            """SELECT COUNT(*) FROM login_audit
                WHERE ip_address = $1
                  AND attempted_at > $2
                  AND result LIKE 'failed_%'""",
            ip, since,
        )
    return int(n or 0)


async def recent_audit_for_employee(
    employee_id: str, limit: int = 25,
) -> list[dict[str, Any]]:
    """Return the most recent N login attempts for an employee.  Used by the
    admin Drivers tab to show recent activity."""
    pool = await get_pool()
    if pool is None:
        return []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT employee_id, ip_address, user_agent, result, attempted_at
                 FROM login_audit
                WHERE employee_id = $1
                ORDER BY attempted_at DESC
                LIMIT $2""",
            employee_id, limit,
        )
    return [_row_to_dict(r) for r in rows]


async def cleanup_old_audit_rows() -> int:
    """Delete login_audit rows older than AUDIT_RETENTION_DAYS.  Called
    opportunistically from the login endpoint with low probability so no
    external scheduler is required.  Returns the number of rows deleted."""
    pool = await get_pool()
    if pool is None:
        return 0
    async with pool.acquire() as conn:
        r = await conn.execute(
            "DELETE FROM login_audit"
            " WHERE attempted_at < NOW() - ($1::int || ' days')::interval",
            AUDIT_RETENTION_DAYS,
        )
    # asyncpg returns "DELETE n" — parse the count
    try:
        return int(r.rsplit(" ", 1)[1])
    except Exception:
        return 0


def _row_to_dict(row) -> dict[str, Any]:
    """Convert an asyncpg Record into a plain dict with ISO-formatted
    timestamps (so it serialises straight to JSON)."""
    if row is None:
        return {}
    out: dict[str, Any] = {}
    for key in row.keys():
        v = row[key]
        if hasattr(v, "isoformat"):
            out[key] = v.isoformat()
        else:
            out[key] = v
    return out
