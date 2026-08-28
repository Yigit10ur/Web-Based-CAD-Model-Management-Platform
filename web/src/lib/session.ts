/**
 * Who is asking, and what they are allowed to touch.
 *
 * Signing in is the easy half. The half that matters is that every read and
 * write of a model resolves through one of the access helpers here: a model id
 * is a guessable-looking uuid in a URL, and before this existed anyone holding
 * one could read any model in the database.
 */

import { and, eq, inArray, or } from 'drizzle-orm';

import { auth } from '@/auth';
import { db, schema } from '@/db';

export class UnauthorizedError extends Error {
  constructor() {
    super('not signed in');
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super('not allowed');
  }
}

export interface CurrentUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
}

export async function currentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * The project a user's uploads land in.
 *
 * Everyone gets one on first use. Projects have no interface yet, so this
 * keeps the data model honest -- models always belong to a project owned by
 * somebody -- without asking the user to think about it.
 */
/**
 * Whether this account's address has been proved.
 *
 * Read from the row rather than from the session: the session was minted when
 * they signed in, and confirming an address afterwards must not need a new one.
 */
export async function emailVerified(userId: string): Promise<boolean> {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  return Boolean(user?.emailVerified);
}

export async function personalProject(userId: string): Promise<string> {
  const existing = await db.query.projects.findFirst({
    where: and(eq(schema.projects.ownerId, userId), eq(schema.projects.slug, 'personal')),
  });

  if (existing) return existing.id;

  const [project] = await db
    .insert(schema.projects)
    .values({ ownerId: userId, name: 'My Models', slug: 'personal' })
    .returning();

  await db
    .insert(schema.projectMembers)
    .values({ projectId: project.id, userId, role: 'owner' })
    .onConflictDoNothing();

  return project.id;
}

/** Project ids the user may read: their memberships, plus anything public. */
export async function readableProjects(userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: schema.projects.id })
    .from(schema.projects)
    .leftJoin(
      schema.projectMembers,
      eq(schema.projectMembers.projectId, schema.projects.id),
    )
    .where(
      or(
        eq(schema.projects.visibility, 'public'),
        eq(schema.projects.ownerId, userId),
        eq(schema.projectMembers.userId, userId),
      ),
    );

  return rows.map((row) => row.id);
}

/**
 * Projects the user may add models to.
 *
 * Read access and write access are different lists: a viewer sees a project's
 * models and cannot put anything in it, so an upload destination picker built
 * from `readableProjects` would offer choices that fail on submit.
 */
export async function writableProjects(userId: string) {
  const readable = await readableProjects(userId);
  if (readable.length === 0) return [];

  const projects = await db.query.projects.findMany({
    where: inArray(schema.projects.id, readable),
  });

  const allowed = await Promise.all(projects.map((p) => canWrite(p.id, userId)));
  return projects.filter((_, index) => allowed[index]);
}

/**
 * A project the user administers, or null.
 *
 * Deciding who else can see a project is the owner's alone. An editor may add
 * models to it; letting them also hand out access would make "editor" a way to
 * become an owner.
 */
export async function ownedProject(projectId: string, userId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId),
  });
  if (!project) return null;
  if (project.ownerId === userId) return project;

  const membership = await db.query.projectMembers.findFirst({
    where: and(
      eq(schema.projectMembers.projectId, projectId),
      eq(schema.projectMembers.userId, userId),
    ),
  });

  return membership?.role === 'owner' ? project : null;
}

/** A project the user may read, or null. */
export async function readableProject(projectId: string, userId: string) {
  const readable = await readableProjects(userId);
  if (!readable.includes(projectId)) return null;

  return (
    (await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) })) ?? null
  );
}

export async function canWrite(projectId: string, userId: string): Promise<boolean> {
  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId),
  });
  if (!project) return false;
  if (project.ownerId === userId) return true;

  const membership = await db.query.projectMembers.findFirst({
    where: and(
      eq(schema.projectMembers.projectId, projectId),
      eq(schema.projectMembers.userId, userId),
    ),
  });

  return membership?.role === 'owner' || membership?.role === 'editor';
}

/**
 * A model the user is allowed to read, or null.
 *
 * Returning null rather than throwing lets callers answer 404 instead of 403:
 * telling someone a model exists but is not theirs leaks more than it needs
 * to.
 */
export async function readableModel(modelId: string, userId: string) {
  const model = await db.query.models.findFirst({
    where: eq(schema.models.id, modelId),
    with: { versions: true },
  });

  if (!model) return null;

  const allowed = await readableProjects(userId);
  return allowed.includes(model.projectId) ? model : null;
}

export async function writableModel(modelId: string, userId: string) {
  const model = await db.query.models.findFirst({
    where: eq(schema.models.id, modelId),
  });

  if (!model) return null;
  return (await canWrite(model.projectId, userId)) ? model : null;
}

/** A version the user is allowed to read, with the model it belongs to. */
export async function readableVersion(versionId: string, userId: string) {
  const version = await db.query.modelVersions.findFirst({
    where: eq(schema.modelVersions.id, versionId),
    with: { model: true },
  });

  if (!version) return null;

  const allowed = await readableProjects(userId);
  return allowed.includes(version.model.projectId) ? version : null;
}

export async function writableVersion(versionId: string, userId: string) {
  const version = await db.query.modelVersions.findFirst({
    where: eq(schema.modelVersions.id, versionId),
    with: { model: true },
  });

  if (!version) return null;
  return (await canWrite(version.model.projectId, userId)) ? version : null;
}
