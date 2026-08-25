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
| `/` | Catalogue and upload — database, storage |
| `/models/:id` | Viewer for a converted model — database, storage |
| `/sample` | Viewer on the bundled sample — nothing |

## Database

```bash
npm run db:generate   # write a migration from src/db/schema.ts
npm run db:migrate    # apply migrations
npm run db:studio     # browse the data
```

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

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
picking, exact mass properties, edge overlay, isolate/hide, an exploded view,
point-to-point measurement that snaps to exact CAD geometry, and a capped
section plane.

Uploads a CAD file straight to object storage, records it, and opens the
converted result once the worker has finished with it.

Not done yet: authentication (everything is attributed to one development
user), projects UI, search and filtering, angle measurement, an off-axis
section plane, and markup.
