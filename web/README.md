# web

Next.js application: the model catalogue and the 3D inspection viewer.

Design and rationale: [../ARCHITECTURE.md](../ARCHITECTURE.md) sections 3 and 6.

## Development

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run db:migrate
npm run dev                    # http://localhost:3000
```

Without `.env.local` the catalogue explains what is missing instead of
crashing, and `/sample` still works: the viewer needs neither a database nor
object storage.

## Routes

| Path | Needs |
|---|---|
| `/` | Catalogue and upload — signed in |
| `/models/:id` | Viewer for a converted model — signed in, and allowed to read it |
| `/sign-in` | GitHub, plus a password-less local sign-in on development builds |
| `/sample` | Viewer on the bundled sample — no database, storage or account |

## Database

```bash
npm run db:generate   # write a migration from src/db/schema.ts
npm run db:migrate    # apply migrations to the development database
npm run db:check      # report which tables exist and how many migrations ran
npm run db:studio     # browse the data
```

`vercel link` writes into `.env.local`: an OIDC token, and any environment
variables it can read from the project. Production credentials do not belong in
the development file, so remove what it adds.

The `:prod` variants read `.env.prod` instead of the usual cascade, for
migrating the production database by hand:

```bash
cp .env.prod.example .env.prod
npm run db:migrate:prod
npm run db:check:prod
```

An explicitly set `DATABASE_URL` wins over `.env.local` in `drizzle.config.ts`.
Without that, a production migration would be quietly redirected at the
development database.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Tests run against Postgres compiled to WebAssembly (PGlite), in process. The
access rules are expressed as SQL, so they are tested by running that SQL --
no container, no credentials, and nothing for CI to hold. `tests/db.ts` applies
the same migrations the real database does, so a schema change that breaks them
breaks the tests too.

## Layout

```
src/app/                  routes (App Router)
src/components/viewer/    R3F scene and inspection tools
src/store/                zustand stores
```

Viewer state rule: visibility, selection and colour live in
`src/store/viewer-store.ts`, never in the three.js scene graph. The tree panel
and the scene read from the same store, which is what keeps them in sync.

## Development sample

`public/samples/assembly.glb` and `assembly.json` are the converter's output,
committed (8 KB) so the viewer can be worked on without a Python environment
and without any cloud services.
Regenerate them with:

```bash
cd ../converter
python -m app.cli convert tests/fixtures/assembly.step \
    ../web/public/samples/assembly.glb
```

## Coordinate system

The scene is **Z-up**, matching the CAD data. The camera is given
`up = [0, 0, 1]` rather than the model being rotated into three.js' Y-up
convention: rotating the geometry would leave every bounding box and centre of
mass in the properties panel in a different frame from the thing on screen.

## Status

Loads the converter's output: assembly tree, part selection, B-rep face
picking, exact mass properties, edge overlay, per-part visibility checkboxes
with isolate, an exploded view, point-to-point measurement that snaps to exact
CAD geometry, and a capped section plane.

Uploads a CAD file straight to object storage, records it, and opens the
converted result once the worker has finished with it. A model can be given a
new revision from its own page; the previous version keeps its files and stays
selectable.

Not done yet: a projects UI (everyone gets one personal project), sharing a
project with another user, search and filtering, angle measurement, an
off-axis section plane, and markup.
