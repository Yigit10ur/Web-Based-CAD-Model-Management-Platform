import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';

import { ModelList, type ModelWithVersions } from '@/components/catalogue/ModelList';
import { UploadForm } from '@/components/catalogue/UploadForm';
import { db, schema } from '@/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * The catalogue.
 *
 * Reads the database directly rather than through the API: it is a server
 * component in the same process, and the round trip would buy nothing.
 */
async function loadModels(): Promise<ModelWithVersions[]> {
  const session = await getSession();

  return db.query.models.findMany({
    where: eq(schema.models.projectId, session.projectId),
    orderBy: [desc(schema.models.createdAt)],
    with: { versions: { orderBy: [desc(schema.modelVersions.versionNo)] } },
  });
}

function NotConfigured({ detail }: { detail: string }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h2 className="text-base font-medium text-slate-900">Not configured yet</h2>
      <p className="pt-2 text-sm text-slate-600">
        The catalogue needs a database and object storage. Copy{' '}
        <code className="rounded bg-slate-100 px-1">.env.example</code> to{' '}
        <code className="rounded bg-slate-100 px-1">.env.local</code>, fill it in, then run{' '}
        <code className="rounded bg-slate-100 px-1">npm run db:migrate</code>.
      </p>
      <pre className="mt-4 overflow-x-auto rounded bg-slate-100 p-3 text-xs text-slate-700">
        {detail}
      </pre>
      <p className="pt-4 text-sm text-slate-600">
        The viewer itself needs neither:{' '}
        <Link href="/sample" className="text-blue-600 hover:underline">
          open the bundled sample
        </Link>
        .
      </p>
    </div>
  );
}

export default async function Home() {
  let models: ModelWithVersions[];

  try {
    models = await loadModels();
  } catch (cause) {
    return (
      <main className="min-h-dvh bg-slate-50">
        <NotConfigured detail={cause instanceof Error ? cause.message : String(cause)} />
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <h1 className="text-base font-medium text-slate-900">CAD Models</h1>
          <Link href="/sample" className="text-xs text-slate-500 hover:underline">
            sample
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6">
        <UploadForm />
        <div className="pt-4">
          <ModelList models={models} />
        </div>
      </div>
    </main>
  );
}
