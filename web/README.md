# web

Next.js application: the model catalogue and the 3D inspection viewer.

Design and rationale: [../ARCHITECTURE.md](../ARCHITECTURE.md) sections 3 and 6.

## Development

```bash
npm install
npm run dev        # http://localhost:3000
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

## Status

The viewer currently renders placeholder geometry. It will load the `.glb` and
`metadata.json` produced by the `converter` service once that lands.
