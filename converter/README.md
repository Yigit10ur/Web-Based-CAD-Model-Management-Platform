# converter

CAD tessellation service. Reads STEP/IGES (via OCCT) and mesh formats, writes a
Draco-friendly `.glb` plus a `metadata.json` describing the assembly tree, exact
mass properties and face groups. The viewer consumes only those two files.

Design and rationale: [../ARCHITECTURE.md](../ARCHITECTURE.md) sections 1 and 5.

## Local development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"        # API, tests and lint -- no OCCT
```

That is enough to run the service, the tests and the linter. The geometry path
needs the heavy dependency:

```bash
pip install -e ".[cad]"        # adds cadquery-ocp, trimesh, numpy
```

If the OCCT wheel does not install on your platform, build the Docker image
instead — that is what it exists for:

```bash
docker build -t cad-converter .
docker run --rm -p 8000:8000 cad-converter
```

## Running

```bash
python -m app.worker               # the conversion queue
uvicorn app.main:app --reload      # health endpoints, http://localhost:8000
python -m app.cli convert samples/bracket.step out/bracket.glb
```

The worker polls the database for queued versions, converts them and writes
`model.glb` and `metadata.json` back to object storage next to the source file.
It reads the same environment variables as the web application, so one
`.env` configures both — see `../web/.env.example`.

Two processes on purpose: a long conversion must not block the health endpoint
the platform uses to decide whether the service is alive.

`GET /ready` reports whether OCCT is importable in the current environment. A
container that answers `/health` but fails `/ready` will accept jobs and fail
every one of them, so check readiness, not liveness.

## Checks

```bash
ruff check .
ruff format --check .
pytest
```

## Test fixture

`tests/fixtures/assembly.step` is generated rather than hand made, so the
reader path is exercised against real product structure -- names, colours and a
three part assembly:

```bash
python scripts/make_fixture.py
```

## Status

STEP and IGES conversion works end to end: assembly tree with names and
colours, exact mass properties from the B-rep, face groups, edges shipped in
the same `.glb` as LINES primitives, and a `snap` block of exact vertices,
edge definitions and face parameters for the viewer's measurement tool.

Not done yet: the mesh path (`.stl` / `.obj`), Draco compression and thumbnail
rendering.
