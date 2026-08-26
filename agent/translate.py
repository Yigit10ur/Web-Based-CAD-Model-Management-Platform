"""Inventor translation agent.

Runs on a Windows machine that has Autodesk Inventor installed, usually inside
the company network. It polls the platform for native Inventor uploads,
converts them to STEP using Inventor itself, and hands the result back.

Inventor's own translator is used rather than a third-party reader on purpose:
nothing else reads its files as faithfully, and the licence is one the company
already owns.

The agent holds one secret, the platform token. It never sees database or
storage credentials -- the platform sends it a presigned URL to read from and
another to write to. The machine with the CAD licence is the last place that
should have a database password sitting in a config file.

    set PLATFORM_URL=https://models.example.com
    set AGENT_TOKEN=...
    python translate.py
"""

from __future__ import annotations

import logging
import os
import sys
import tempfile
import time
import zipfile
from pathlib import Path

import requests

logger = logging.getLogger("agent")

PLATFORM_URL = os.environ.get("PLATFORM_URL", "http://localhost:3000").rstrip("/")
AGENT_TOKEN = os.environ.get("AGENT_TOKEN", "")
POLL_SECONDS = float(os.environ.get("AGENT_POLL_SECONDS", "10"))

# Inventor's STEP translator add-in. Stable across releases, but worth
# confirming against the installed version the first time this is set up:
# Tools -> Add-Ins lists the identifier.
STEP_TRANSLATOR_ID = "{90AF7F40-0C01-11D5-8E83-0010B541CD80}"

# Inventor API constants, spelled out rather than imported: the constant
# module is only available once the COM type library has been generated, and
# depending on that makes first-run setup fragile.
K_FILE_BROWSE_IO_MECHANISM = 13059
AP214_AUTOMOTIVE_DESIGN = 3


class TranslationError(RuntimeError):
    """Raised with a message meant for whoever uploaded the file."""


def session() -> requests.Session:
    if not AGENT_TOKEN:
        raise SystemExit("AGENT_TOKEN is not set")

    http = requests.Session()
    http.headers["authorization"] = f"Bearer {AGENT_TOKEN}"
    return http


def claim(http: requests.Session) -> dict | None:
    response = http.post(f"{PLATFORM_URL}/api/agent/claim", timeout=30)
    response.raise_for_status()
    return response.json().get("job")


def download(http: requests.Session, url: str, destination: Path) -> Path:
    # The presigned URL carries its own authorisation; sending the agent token
    # to object storage as well would leak it to a third party.
    with requests.get(url, stream=True, timeout=300) as response:
        response.raise_for_status()
        with destination.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1 << 20):
                handle.write(chunk)

    return destination


def unpack(archive: Path, workspace: Path) -> Path:
    """Find the document to open inside a Pack and Go archive.

    An assembly is a tree of references, so it arrives as a folder rather than
    a file. The root is the one assembly in it; several would be ambiguous and
    guessing which one was meant is worse than asking.
    """
    with zipfile.ZipFile(archive) as bundle:
        bundle.extractall(workspace)

    assemblies = sorted(workspace.rglob("*.iam"))
    if len(assemblies) == 1:
        return assemblies[0]
    if len(assemblies) > 1:
        names = ", ".join(path.name for path in assemblies[:5])
        raise TranslationError(
            f"the archive holds {len(assemblies)} assemblies ({names}). "
            "Upload one assembly per archive."
        )

    parts = sorted(workspace.rglob("*.ipt"))
    if len(parts) == 1:
        return parts[0]

    raise TranslationError("the archive holds no Inventor part or assembly")


def _set_option(options, name: str, value: object) -> None:
    """Set a key on an Inventor NameValueMap.

    `Value` is a parameterised COM property, which pywin32 surfaces as an
    indexable object on some builds and not on others. Falling back to `Add`
    covers both rather than depending on which binding is installed.
    """
    try:
        options.Value[name] = value
    except (AttributeError, TypeError):
        options.Add(name, value)


def export_step(document_path: Path, out_step: Path) -> Path:
    """Drive Inventor to write a STEP file.

    Opened invisibly and closed again whatever happens: a dialog left on screen
    on an unattended machine stops the queue until someone logs in and clicks
    it.
    """
    import win32com.client  # Windows only, imported here so the module loads anywhere

    inventor = win32com.client.Dispatch("Inventor.Application")
    inventor.Visible = False
    inventor.SilentOperation = True

    document = None
    try:
        document = inventor.Documents.Open(str(document_path), False)

        translator = inventor.ApplicationAddIns.ItemById(STEP_TRANSLATOR_ID)
        context = inventor.TransientObjects.CreateTranslationContext()
        context.Type = K_FILE_BROWSE_IO_MECHANISM

        options = inventor.TransientObjects.CreateNameValueMap()
        medium = inventor.TransientObjects.CreateDataMedium()

        # Asking the translator to populate its own defaults first means the
        # options map has every key it expects, whatever the Inventor version.
        if translator.HasSaveCopyAsOptions(document, context, options):
            _set_option(options, "ApplicationProtocolType", AP214_AUTOMOTIVE_DESIGN)

        medium.FileName = str(out_step)
        translator.SaveCopyAs(document, context, options, medium)
    finally:
        if document is not None:
            document.Close(True)

    if not out_step.exists():
        raise TranslationError("Inventor reported success but wrote no STEP file")

    return out_step


def upload(url: str, step: Path) -> None:
    with step.open("rb") as handle:
        response = requests.put(
            url,
            data=handle,
            headers={"content-type": "application/step"},
            timeout=600,
        )
    response.raise_for_status()


def report_success(
    http: requests.Session, version_id: str, translated_key: str
) -> None:
    response = http.post(
        f"{PLATFORM_URL}/api/agent/versions/{version_id}/translated",
        json={"translatedKey": translated_key},
        timeout=30,
    )
    response.raise_for_status()


def report_failure(http: requests.Session, version_id: str, message: str) -> None:
    http.post(
        f"{PLATFORM_URL}/api/agent/versions/{version_id}/failed",
        json={"message": message},
        timeout=30,
    )


def handle(http: requests.Session, job: dict) -> None:
    version_id = job["versionId"]
    filename = job["filename"]
    logger.info("translating %s (%s)", version_id, filename)

    with tempfile.TemporaryDirectory(prefix="inventor-") as workspace:
        root = Path(workspace)
        downloaded = download(http, job["downloadUrl"], root / filename)

        document = (
            unpack(downloaded, root / "unpacked")
            if downloaded.suffix.lower() == ".zip"
            else downloaded
        )

        step = export_step(document, root / "translated.step")
        upload(job["uploadUrl"], step)

    report_success(http, version_id, job["translatedKey"])
    logger.info("done %s", version_id)


def run() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )

    http = session()
    logger.info(
        "agent started against %s, polling every %.0fs", PLATFORM_URL, POLL_SECONDS
    )

    while True:
        try:
            job = claim(http)
        except requests.RequestException:
            logger.exception("could not reach the platform; retrying")
            time.sleep(POLL_SECONDS)
            continue

        if job is None:
            time.sleep(POLL_SECONDS)
            continue

        try:
            handle(http, job)
        except TranslationError as error:
            report_failure(http, job["versionId"], str(error))
            logger.error("failed %s: %s", job["versionId"], error)
        except Exception as error:  # noqa: BLE001 - one bad file must not stop the queue
            report_failure(http, job["versionId"], f"{type(error).__name__}: {error}")
            logger.exception("failed %s", job["versionId"])


if __name__ == "__main__":
    sys.exit(run())
