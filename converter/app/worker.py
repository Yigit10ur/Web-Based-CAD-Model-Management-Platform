"""The conversion queue.

Polls the database for queued versions, converts them and writes the result
back. There is no broker: at MVP volume a table plus `FOR UPDATE SKIP LOCKED`
is a correct queue, and one fewer moving part to run and debug.

    python -m app.worker
"""

from __future__ import annotations

import json
import logging
import signal
import tempfile
import time
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row

from app.config import settings
from app.pipeline import UnsupportedFormatError, convert
from app.storage import download, sibling_key, upload

logger = logging.getLogger("worker")

# Claiming and releasing in one statement keeps two workers from taking the
# same row: the subquery locks it, and SKIP LOCKED sends the other worker to
# the next one instead of making it wait.
CLAIM_SQL = """
UPDATE model_versions
SET status = 'processing', claimed_at = now()
WHERE id = (
    SELECT id FROM model_versions
    WHERE status = 'queued'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
RETURNING id, model_id, source_key, source_format
"""

# A worker that dies mid-job leaves its row claimed forever. Nothing else would
# ever notice, so the queue reclaims anything that has been processing for
# longer than a conversion could plausibly take.
REQUEUE_STALE_SQL = """
UPDATE model_versions
SET status = 'queued', claimed_at = NULL
WHERE status = 'processing'
  AND claimed_at < now() - make_interval(secs => %s)
RETURNING id
"""

SUCCEED_SQL = """
UPDATE model_versions
SET status = 'ready',
    glb_key = %s,
    metadata_key = %s,
    stats = %s,
    error_message = NULL,
    claimed_at = NULL
WHERE id = %s
"""

FAIL_SQL = """
UPDATE model_versions
SET status = 'failed', error_message = %s, claimed_at = NULL
WHERE id = %s
"""


def connect() -> psycopg.Connection:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not set; see .env.example")
    return psycopg.connect(settings.database_url, row_factory=dict_row, autocommit=True)


def requeue_stale(conn: psycopg.Connection) -> int:
    with conn.cursor() as cursor:
        cursor.execute(REQUEUE_STALE_SQL, (settings.stale_job_seconds,))
        rows = cursor.fetchall()
    if rows:
        logger.warning("requeued %d abandoned job(s)", len(rows))
    return len(rows)


def claim(conn: psycopg.Connection) -> dict[str, Any] | None:
    with conn.cursor() as cursor:
        cursor.execute(CLAIM_SQL)
        return cursor.fetchone()


def process(conn: psycopg.Connection, job: dict[str, Any]) -> None:
    version_id = job["id"]
    source_key = job["source_key"]
    logger.info("converting %s (%s)", version_id, source_key)

    with tempfile.TemporaryDirectory(prefix="cad-") as workspace:
        root = Path(workspace)
        source = download(source_key, root / Path(source_key).name)
        out_glb = root / "model.glb"

        result = convert(source, out_glb)

        glb_key = sibling_key(source_key, "model.glb")
        metadata_key = sibling_key(source_key, "metadata.json")

        upload(out_glb, glb_key, "model/gltf-binary")
        upload(out_glb.with_suffix(".json"), metadata_key, "application/json")

        stats = {
            "triangleCount": result.triangle_count,
            "deflection": result.deflection,
            "partCount": len(result.metadata.parts),
            "units": result.metadata.units,
        }

    with conn.cursor() as cursor:
        cursor.execute(
            SUCCEED_SQL, (glb_key, metadata_key, json.dumps(stats), version_id)
        )

    logger.info("done %s: %d triangles", version_id, result.triangle_count)


def fail(conn: psycopg.Connection, version_id: str, message: str) -> None:
    logger.error("failed %s: %s", version_id, message)
    with conn.cursor() as cursor:
        cursor.execute(FAIL_SQL, (message[:2000], version_id))


def run() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )

    stopping = False

    def stop(*_: object) -> None:
        nonlocal stopping
        logger.info("stopping after the current job")
        stopping = True

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    conn = connect()
    logger.info("worker started, polling every %.1fs", settings.poll_interval)

    while not stopping:
        try:
            requeue_stale(conn)
            job = claim(conn)
        except psycopg.Error:
            logger.exception("database error while claiming; retrying")
            time.sleep(settings.poll_interval)
            continue

        if job is None:
            time.sleep(settings.poll_interval)
            continue

        try:
            process(conn, job)
        except UnsupportedFormatError as error:
            fail(conn, job["id"], str(error))
        except Exception as error:  # noqa: BLE001 - the job must not take the worker down
            fail(conn, job["id"], f"{type(error).__name__}: {error}")

    conn.close()


if __name__ == "__main__":
    run()
