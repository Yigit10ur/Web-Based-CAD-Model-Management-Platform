import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SignOutButton } from '@/components/auth/SignOutButton';
import { CreateProject } from '@/components/projects/CreateProject';
import { projectsFor } from '@/lib/projects';
import { currentUser, personalProject } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const user = await currentUser();
  if (!user) redirect('/sign-in');

  await personalProject(user.id);
  const projects = await projectsFor(user.id);

  return (
    <main className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <Link href="/" className="text-sm text-blue-600 hover:underline">
              ← Models
            </Link>
            <h1 className="text-base font-medium text-slate-900">Projects</h1>
          </div>
          <SignOutButton email={user.email} />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6">
        <CreateProject />

        <ul className="divide-y divide-slate-200 pt-6">
          {projects.map((project) => (
            <li key={project.id} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <Link
                  href={`/projects/${project.id}`}
                  className="text-sm font-medium text-slate-900 hover:underline"
                >
                  {project.name}
                </Link>
                <p className="pt-0.5 text-xs text-slate-500">
                  {project.memberCount === 1
                    ? 'only you'
                    : `${project.memberCount} people`}
                </p>
              </div>

              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                {project.role}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
