import Link from 'next/link';

import { ModelWorkspace } from '@/components/viewer/ModelWorkspace';

/**
 * The bundled sample, viewable without a database or storage configured.
 *
 * Keeping this route means the viewer can be worked on with nothing but
 * `npm run dev`. Regenerate the files with:
 *
 *   cd converter && python -m app.cli convert tests/fixtures/assembly.step \
 *       ../web/public/samples/assembly.glb
 */
export default function SamplePage() {
  return (
    <main className="flex h-dvh flex-col bg-slate-50">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Models
          </Link>
          <h1 className="text-sm font-medium text-slate-900">assembly.step</h1>
        </div>
        <span className="text-xs text-slate-500">bundled converter sample</span>
      </header>
      <ModelWorkspace
        versionId="sample"
        modelUrl="/samples/assembly.glb"
        metadataUrl="/samples/assembly.json"
      />
    </main>
  );
}
