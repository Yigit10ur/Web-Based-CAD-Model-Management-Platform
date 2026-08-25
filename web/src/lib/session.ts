/**
 * Stand-in for authentication.
 *
 * Auth is deliberately not built yet, but the schema and the API already carry
 * a user and a project so that adding Auth.js later is a change of this one
 * function rather than a change of every route. Everything written through the
 * API is attributed to a single development user.
 */

import { eq } from 'drizzle-orm';

import { db, schema } from '@/db';

const DEV_EMAIL = 'dev@localhost';
const DEV_PROJECT_SLUG = 'default';

export interface Session {
  userId: string;
  /** The project new models land in until projects have a UI of their own. */
  projectId: string;
}

export async function getSession(): Promise<Session> {
  const [user] = await db
    .insert(schema.users)
    .values({ email: DEV_EMAIL, name: 'Development User' })
    .onConflictDoUpdate({
      target: schema.users.email,
      set: { email: DEV_EMAIL },
    })
    .returning();

  const existing = await db.query.projects.findFirst({
    where: (projects, { and, eq: equals }) =>
      and(equals(projects.ownerId, user.id), equals(projects.slug, DEV_PROJECT_SLUG)),
  });

  if (existing) return { userId: user.id, projectId: existing.id };

  const [project] = await db
    .insert(schema.projects)
    .values({
      ownerId: user.id,
      name: 'Default Project',
      slug: DEV_PROJECT_SLUG,
    })
    .returning();

  await db
    .insert(schema.projectMembers)
    .values({ projectId: project.id, userId: user.id, role: 'owner' })
    .onConflictDoNothing();

  return { userId: user.id, projectId: project.id };
}

export async function requireUser(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) throw new Error(`unknown user ${userId}`);
  return user;
}
