import { desc, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ModelList, type ModelWithVersions } from '@/components/catalogue/ModelList';
import { UploadForm } from '@/components/catalogue/UploadForm';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { VerifyBanner } from '@/components/auth/VerifyBanner';
import { db, schema } from '@/db';
import { projectsFor } from '@/lib/projects';
import {
  currentUser,
  emailVerified,
  personalProject,
  readableProjects,
  writableProjects,
} from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * The catalogue.
 *
 * Reads the database directly rather than through the API: it is a server
 * component in the same process, and the round trip would buy nothing.
 */
async function loadModels(userId: string): Promise<ModelWithVersions[]> {
  // Make sure the user has somewhere to upload to, then list everything they
  // can read -- not just that one project, or a model shared with them would
  // be openable by URL but invisible in the catalogue.
  await personalProject(userId);
  const projectIds = await readableProjects(userId);

  return db.query.models.findMany({
    where: inArray(schema.models.projectId, projectIds),
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

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export default async function Home() {
  // redirect() reports itself by throwing, so it stays outside every try
  // block: caught, it would turn "please sign in" into "not configured".
  let user: Awaited<ReturnType<typeof currentUser>>;
  try {
    user = await currentUser();
  } catch (cause) {
    return (
      <main className="min-h-dvh bg-slate-50">
        <NotConfigured detail={describe(cause)} />
      </main>
    );
  }

  if (!user) redirect('/sign-in');

  let models: ModelWithVersions[];
  let projects: Awaited<ReturnType<typeof projectsFor>>;
  let destinations: { id: string; name: string }[];
  let verified = true;
  try {
    models = await loadModels(user.id);
    projects = await projectsFor(user.id);
    destinations = (await writableProjects(user.id)).map((project) => ({
      id: project.id,
      name: project.name,
    }));
    verified = await emailVerified(user.id);
  } catch (cause) {
    return (
      <main className="min-h-dvh bg-slate-50">
        <NotConfigured detail={describe(cause)} />
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <h1 className="text-base font-medium text-slate-900">EhsimCAD</h1>
          <div className="flex items-center gap-4">
            <Link href="/projects" className="text-xs text-slate-500 hover:underline">
              projects
            </Link>
            <Link href="/sample" className="text-xs text-slate-500 hover:underline">
              sample
            </Link>
            <SignOutButton email={user.email} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6">
        {!verified && (
          <div className="pb-4">
            <VerifyBanner email={user.email} />
          </div>
        )}

        <UploadForm destinations={destinations} />
        <div className="pt-4">
          {/* Which project a model is in only means something once there is
              more than one to tell apart. */}
          <ModelList
            models={models}
            projects={projects.length > 1 ? projects : []}
          />
        </div>
      </div>
    </main>
  );
}
