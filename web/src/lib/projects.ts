/**
 * Projects and who is in them.
 *
 * The authorization rules live in `session.ts`; this is the writing side --
 * making a project, and moving people in and out of one.
 */

import { and, eq, inArray } from 'drizzle-orm';

import { db, schema } from '@/db';
import { readableProjects } from '@/lib/session';

export type MemberRole = (typeof schema.memberRoleEnum.enumValues)[number];

/** Turkish letters that would otherwise be dropped as non-ASCII. */
const TRANSLITERATIONS: Record<string, string> = {
  ç: 'c', Ç: 'c',
  ğ: 'g', Ğ: 'g',
  ı: 'i', İ: 'i',
  ö: 'o', Ö: 'o',
  ş: 's', Ş: 's',
  ü: 'u', Ü: 'u',
};

/**
 * A name reduced to something a URL and a unique index can hold.
 *
 * Transliterated before it is lowercased, and decomposed marks are dropped
 * afterwards. Both steps are needed for one letter: `'İ'.toLowerCase()` is not
 * `i` but `i` followed by a combining dot above, so lowercasing first hides the
 * letter from the table and leaves behind a mark that is not a letter --
 * `İÇ GÖVDE` came out as `i-c-govde`.
 */
export function slugify(name: string): string {
  const folded = [...name]
    .map((character) => TRANSLITERATIONS[character] ?? character)
    .join('')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return (
    folded
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'project'
  );
}

/**
 * Create a project, with its creator as owner.
 *
 * Slugs are unique per owner, and `personal` is already taken by the project
 * every account gets on first sign-in, so a name that collides is suffixed
 * rather than rejected: the name a person chose is not wrong because of a
 * database index.
 */
export async function createProject(userId: string, name: string, description?: string) {
  const base = slugify(name);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;

    const existing = await db.query.projects.findFirst({
      where: and(eq(schema.projects.ownerId, userId), eq(schema.projects.slug, slug)),
    });
    if (existing) continue;

    const [project] = await db
      .insert(schema.projects)
      .values({ ownerId: userId, name, slug, description })
      .returning();

    await db
      .insert(schema.projectMembers)
      .values({ projectId: project.id, userId, role: 'owner' })
      .onConflictDoNothing();

    return project;
  }

  throw new Error(`could not find a free slug for ${name}`);
}

export type ProjectSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: MemberRole;
  memberCount: number;
};

/**
 * The projects a user can see, each with the role they hold in it.
 *
 * Shared by the API and the pages that render it, so that the badge on screen
 * and the answer the API gives cannot drift apart.
 */
export async function projectsFor(userId: string): Promise<ProjectSummary[]> {
  const readable = await readableProjects(userId);
  if (readable.length === 0) return [];

  const projects = await db.query.projects.findMany({
    where: inArray(schema.projects.id, readable),
  });

  const memberships = await db.query.projectMembers.findMany({
    where: inArray(schema.projectMembers.projectId, readable),
  });

  const mine = new Map(
    memberships
      .filter((membership) => membership.userId === userId)
      .map((membership) => [membership.projectId, membership.role]),
  );

  return projects
    .map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      // Ownership of the row wins over a membership row that disagrees with
      // it, the same way it does in the access checks.
      role: (project.ownerId === userId
        ? 'owner'
        : (mine.get(project.id) ?? 'viewer')) as MemberRole,
      memberCount: memberships.filter((m) => m.projectId === project.id).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Everyone in a project: members who have an account, and invitations waiting. */
export async function membersOf(projectId: string) {
  const members = await db
    .select({
      userId: schema.projectMembers.userId,
      role: schema.projectMembers.role,
      email: schema.users.email,
      name: schema.users.name,
      image: schema.users.image,
    })
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.projectMembers.userId))
    .where(eq(schema.projectMembers.projectId, projectId));

  const invitations = await db.query.projectInvitations.findMany({
    where: eq(schema.projectInvitations.projectId, projectId),
  });

  return { members, invitations };
}

export type AddMemberResult =
  | { kind: 'member'; userId: string }
  | { kind: 'invitation'; email: string };

/**
 * Give someone access by email.
 *
 * If they have signed in before they become a member immediately. If they have
 * not, there is no account to attach a role to yet, so the invitation waits and
 * `claimInvitations` turns it into a membership when they first arrive.
 */
export async function addMember(
  projectId: string,
  email: string,
  role: MemberRole,
  invitedBy: string,
): Promise<AddMemberResult> {
  const address = email.trim().toLowerCase();

  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, address),
  });

  if (user) {
    await db
      .insert(schema.projectMembers)
      .values({ projectId, userId: user.id, role })
      .onConflictDoUpdate({
        target: [schema.projectMembers.projectId, schema.projectMembers.userId],
        set: { role },
      });

    return { kind: 'member', userId: user.id };
  }

  await db
    .insert(schema.projectInvitations)
    .values({ projectId, email: address, role, invitedBy })
    .onConflictDoUpdate({
      target: [schema.projectInvitations.projectId, schema.projectInvitations.email],
      set: { role, invitedBy },
    });

  return { kind: 'invitation', email: address };
}

/** Take access away, whether it had been accepted or is still waiting. */
export async function removeMember(projectId: string, userId: string) {
  await db
    .delete(schema.projectMembers)
    .where(
      and(
        eq(schema.projectMembers.projectId, projectId),
        eq(schema.projectMembers.userId, userId),
      ),
    );
}

export async function cancelInvitation(projectId: string, email: string) {
  await db
    .delete(schema.projectInvitations)
    .where(
      and(
        eq(schema.projectInvitations.projectId, projectId),
        eq(schema.projectInvitations.email, email.trim().toLowerCase()),
      ),
    );
}

/**
 * Turn any invitations addressed to this person into memberships.
 *
 * Called when someone signs in. Their account may be minutes old, so this is
 * the first moment the invitations sent to their address can be attached to
 * anything.
 *
 * Only for an address that has been proved. An invitation is addressed to a
 * person by their email, so opening it for anyone who merely typed that email
 * into a registration form would make sharing forgeable: register as your
 * colleague, collect what was meant for them. Signing in through GitHub counts
 * as proof -- GitHub only gives us an address it has verified -- and a password
 * account proves it by following a link sent there.
 *
 * The check is here rather than at the call sites so that there is one of it.
 */
export async function claimInvitations(userId: string, email: string): Promise<number> {
  const address = email.trim().toLowerCase();

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  if (!user?.emailVerified) return 0;

  const waiting = await db.query.projectInvitations.findMany({
    where: eq(schema.projectInvitations.email, address),
  });

  if (waiting.length === 0) return 0;

  for (const invitation of waiting) {
    await db
      .insert(schema.projectMembers)
      .values({ projectId: invitation.projectId, userId, role: invitation.role })
      .onConflictDoNothing();
  }

  await db
    .delete(schema.projectInvitations)
    .where(eq(schema.projectInvitations.email, address));

  return waiting.length;
}
