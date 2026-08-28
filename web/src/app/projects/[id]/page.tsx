import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { SignOutButton } from '@/components/auth/SignOutButton';
import { MemberList } from '@/components/projects/MemberList';
import { membersOf } from '@/lib/projects';
import { currentUser, ownedProject, readableProject } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: Props) {
  const user = await currentUser();
  if (!user) redirect('/sign-in');

  const { id } = await params;

  // A project id in a URL is not an authorisation, the same as everywhere else:
  // someone who may not see this project gets the 404 a made-up id would give.
  const project = await readableProject(id, user.id);
  if (!project) notFound();

  const canManage = Boolean(await ownedProject(id, user.id));
  const { members, invitations } = await membersOf(id);

  return (
    <main className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <Link href="/projects" className="text-sm text-blue-600 hover:underline">
              ← Projects
            </Link>
            <h1 className="text-base font-medium text-slate-900">{project.name}</h1>
          </div>
          <SignOutButton email={user.email} />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6">
        <h2 className="pb-3 text-xs font-medium tracking-wide text-slate-500 uppercase">
          Who has access
        </h2>

        <MemberList
          projectId={project.id}
          ownerId={project.ownerId}
          members={members}
          invitations={invitations}
          canManage={canManage}
        />

        {!canManage && (
          <p className="pt-3 text-xs text-slate-500">
            Only the project&rsquo;s owner can change who has access.
          </p>
        )}
      </div>
    </main>
  );
}
