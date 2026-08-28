import { inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db, schema } from '@/db';
import { createProject } from '@/lib/projects';
import { currentUser, personalProject, readableProjects } from '@/lib/session';

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
  const readable = await readableProjects(user.id);
  if (readable.length === 0) return NextResponse.json({ projects: [] });

  const projects = await db.query.projects.findMany({
    where: inArray(schema.projects.id, readable),
  });

  const memberships = await db.query.projectMembers.findMany({
    where: inArray(schema.projectMembers.projectId, readable),
  });

  const roleOf = new Map(
    memberships
      .filter((membership) => membership.userId === user.id)
      .map((membership) => [membership.projectId, membership.role]),
  );

  return NextResponse.json({
    projects: projects
      .map((project) => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        // Ownership of the row wins over a membership row that disagrees with
        // it, the same way it does in the access checks.
        role: project.ownerId === user.id ? 'owner' : (roleOf.get(project.id) ?? 'viewer'),
        memberCount: memberships.filter((m) => m.projectId === project.id).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
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
