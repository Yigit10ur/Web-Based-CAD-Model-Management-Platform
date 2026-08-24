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
uvicorn app.main:app --reload      # http://localhost:8000/health
python -m app.cli convert samples/bracket.step out/bracket.glb
```

`GET /ready` reports whether OCCT is importable in the current environment. A
container that answers `/health` but fails `/ready` will accept jobs and fail
every one of them, so check readiness, not liveness.

## Checks

```bash
ruff check .
ruff format --check .
pytest
```

## Status

Skeleton only. The OCCT pipeline in `app/cad/occt.py` is unimplemented and is
the subject of the `spike/occt-step-to-glb` branch.
