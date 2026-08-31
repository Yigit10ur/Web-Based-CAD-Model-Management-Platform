"""Object storage access for the worker.

Speaks the S3 API, like the web application, so Supabase Storage, R2 and S3
are all a change of environment variables rather than of code.
"""

from __future__ import annotations

from pathlib import Path

import boto3

from app.config import settings

_client = None


def client():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=settings.storage_endpoint,
            region_name=settings.storage_region,
            aws_access_key_id=settings.storage_access_key_id,
            aws_secret_access_key=settings.storage_secret_access_key,
        )
    return _client


def download(key: str, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    client().download_file(settings.storage_bucket, key, str(destination))
    return destination


def upload(source: Path, key: str, content_type: str) -> str:
    client().upload_file(
        str(source),
        settings.storage_bucket,
        key,
        ExtraArgs={"ContentType": content_type},
    )
    return key


def sibling_key(source_key: str, filename: str) -> str:
    """A key next to another one.

    Every version's files live in one directory named after the version, so the
    derived files are found by replacing the last segment rather than by
    rebuilding the path from ids the worker would otherwise have to join for.
    """
    prefix = source_key.rsplit("/", 1)[0]
    return f"{prefix}/{filename}"
