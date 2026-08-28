import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createProject, projectsFor } from '@/lib/projects';
import { currentUser, personalProject } from '@/lib/session';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

const unauthorized = () => NextResponse.json({ error: 'not signed in' }, { status: 401 });

/** Projects the user can see, each with the role they hold in it. */
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();

  await personalProject(user.id);
  return NextResponse.json({ projects: await projectsFor(user.id) });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const body = createSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const project = await createProject(user.id, body.data.name, body.data.description);

  return NextResponse.json({ project }, { status: 201 });
}
