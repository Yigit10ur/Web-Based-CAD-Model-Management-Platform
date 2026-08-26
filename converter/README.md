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

The container runs the worker by default, because that is what the deployment
needs; the health API is still in the image and can be run instead by
overriding the command. The worker checks that OCCT is importable before it
claims anything and exits with a message if it is not — a container that is up
but cannot convert looks healthy from outside and turns the queue into a list
of failures.

Deployment: [../DEPLOY.md](../DEPLOY.md)

`GET /ready` reports whether OCCT is importable in the current environment. A
container that answers `/health` but fails `/ready` will accept jobs and fail
every one of them, so check readiness, not liveness.

## Checks

```bash
ruff check .
ruff format --check .
pytest
```

## Test fixtures

Generated rather than checked in by hand, so what each file contains is stated
in code:

```bash
python scripts/make_fixture.py
```

| File | What it is for |
|---|---|
| `assembly.step` | Real product structure: names, colours, three parts |
| `two_solids.igs` | The IGES path, and what it loses |
| `box.stl` | A watertight mesh |
| `open_surface.stl` | A mesh that encloses no volume |

## STEP and IGES are not equivalent

Both are read exactly -- volume, faces, edges and snap targets all come from
the B-rep either way. But **IGES carries no product structure**: an assembly
exported to it arrives as a single unnamed part, because the format has nowhere
to put the tree. Prefer STEP when the assembly tree matters, which is usually.

## Status

STEP and IGES conversion works end to end: assembly tree with names and
colours, exact mass properties from the B-rep, face groups, edges shipped in
the same `.glb` as LINES primitives, and a `snap` block of exact vertices,
edge definitions and face parameters for the viewer's measurement tool.

Mesh files (`.stl`, `.obj`, `.ply`, glTF) go through a second path that
measures rather than computes: volume only when the mesh is watertight, no
face groups and no snap targets, and creases derived from the angle between
adjacent triangles in place of B-rep edges. `geometry_source` in the metadata
says which path a model came through.

Not done yet: Draco compression and thumbnail rendering.
