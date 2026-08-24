"""Health and readiness endpoints.

The converter is not a public API: it polls the database for queued jobs and
writes to object storage. These endpoints exist so the platform hosting it can
tell whether the process is alive and whether the CAD toolchain actually loaded.
"""

from fastapi import FastAPI

from app.cad import occt

app = FastAPI(title="CAD Converter", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def ready() -> dict[str, bool | str]:
    """Readiness reports whether OCCT is importable in this environment.

    A container that is up but cannot import OCP can still serve health checks
    while silently failing every STEP job, which is the failure mode worth
    catching early.
    """
    occt_available = occt.available()
    return {
        "ready": occt_available,
        "occt": occt_available,
        "detail": "ok" if occt_available else "OCCT bindings not importable",
    }
