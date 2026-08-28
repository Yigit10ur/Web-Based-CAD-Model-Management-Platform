/**
 * Sharing a project with somebody.
 *
 * The rules for who may read a model were already covered; what is new here is
 * who may hand that access out, and what happens when the person being given
 * access has never signed in. The second case is the whole reason invitations
 * exist: an account only appears at first sign-in, so "share this with my
 * manager" cannot mean "wait for your manager to sign in first".
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDatabase } from './db';

const holder = vi.hoisted(() => ({ db: null as unknown as TestDatabase }));

vi.mock('@/db', async () => {
  const schema = await import('@/db/schema');
  return {
    get db() {
      return holder.db;
    },
    schema,
  };
});

vi.mock('@/auth', () => ({
  auth: vi.fn(async () => null),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
  githubEnabled: false,
  devSignInEnabled: true,
}));

import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import {
  addMember,
  claimInvitations,
  createProject,
  membersOf,
  removeMember,
  slugify,
} from '@/lib/projects';
import { canWrite, ownedProject, readableProjects, writableProjects } from '@/lib/session';

const db = () => holder.db;

/**
 * A fresh account, with its address unproved -- which is what registering with
 * a password gives you, and what signing in through GitHub does not.
 */
async function makeUser(email: string) {
  const [user] = await db().insert(schema.users).values({ email }).returning();
  return user;
}

/** The same, having proved the address. */
async function makeVerifiedUser(email: string) {
  const [user] = await db()
    .insert(schema.users)
    .values({ email, emailVerified: new Date() })
    .returning();
  return user;
}

let owner: Awaited<ReturnType<typeof makeUser>>;
let colleague: Awaited<ReturnType<typeof makeUser>>;
let stranger: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  holder.db = await createTestDatabase();
});

beforeEach(async () => {
  await db().delete(schema.modelVersions);
  await db().delete(schema.models);
  await db().delete(schema.projectInvitations);
  await db().delete(schema.projectMembers);
  await db().delete(schema.projects);
  await db().delete(schema.users);

  owner = await makeUser('owner@example.com');
  colleague = await makeUser('colleague@example.com');
  stranger = await makeUser('stranger@example.com');
});

describe('creating a project', () => {
  it('makes the creator its owner', async () => {
    const project = await createProject(owner.id, 'Bogie Programme');

    expect(await canWrite(project.id, owner.id)).toBe(true);
    expect(await ownedProject(project.id, owner.id)).not.toBeNull();
    expect(await readableProjects(stranger.id)).not.toContain(project.id);
  });

  it('does not reject a name because the slug is taken', async () => {
    const first = await createProject(owner.id, 'Fixtures');
    const second = await createProject(owner.id, 'Fixtures');

    expect(second.name).toBe('Fixtures');
    expect(second.slug).not.toBe(first.slug);
    expect(second.id).not.toBe(first.id);
  });

  it('leaves another account free to use the same slug', async () => {
    await createProject(owner.id, 'Fixtures');
    const theirs = await createProject(colleague.id, 'Fixtures');

    expect(theirs.slug).toBe('fixtures');
  });
});

describe('adding someone who already has an account', () => {
  it('gives them the project straight away', async () => {
    const project = await createProject(owner.id, 'Bogie');
    expect(await readableProjects(colleague.id)).not.toContain(project.id);

    const result = await addMember(project.id, 'colleague@example.com', 'viewer', owner.id);

    expect(result).toEqual({ kind: 'member', userId: colleague.id });
    expect(await readableProjects(colleague.id)).toContain(project.id);
  });

  it('matches the address whatever case it was typed in', async () => {
    const project = await createProject(owner.id, 'Bogie');
    await addMember(project.id, '  Colleague@Example.COM ', 'editor', owner.id);

    expect(await readableProjects(colleague.id)).toContain(project.id);
  });

  it('separates what a viewer may read from what they may write', async () => {
    const project = await createProject(owner.id, 'Bogie');
    await addMember(project.id, colleague.email!, 'viewer', owner.id);

    expect(await readableProjects(colleague.id)).toContain(project.id);
    expect(await canWrite(project.id, colleague.id)).toBe(false);
    expect((await writableProjects(colleague.id)).map((p) => p.id)).not.toContain(project.id);
  });

  it('lets an editor add models but not people', async () => {
    const project = await createProject(owner.id, 'Bogie');
    await addMember(project.id, colleague.email!, 'editor', owner.id);

    expect(await canWrite(project.id, colleague.id)).toBe(true);
    // Otherwise "editor" would be a way to become an owner.
    expect(await ownedProject(project.id, colleague.id)).toBeNull();
  });

  it('changes a role rather than failing on the second attempt', async () => {
    const project = await createProject(owner.id, 'Bogie');
    await addMember(project.id, colleague.email!, 'viewer', owner.id);
    await addMember(project.id, colleague.email!, 'editor', owner.id);

    expect(await canWrite(project.id, colleague.id)).toBe(true);
    const { members } = await membersOf(project.id);
    expect(members.filter((m) => m.userId === colleague.id)).toHaveLength(1);
  });
});

describe('adding someone who has never signed in', () => {
  it('waits for them instead of failing', async () => {
    const project = await createProject(owner.id, 'Bogie');

    const result = await addMember(project.id, 'manager@ehsim.example', 'viewer', owner.id);

    expect(result).toEqual({ kind: 'invitation', email: 'manager@ehsim.example' });
    const { members, invitations } = await membersOf(project.id);
    expect(members.map((m) => m.email)).toEqual([owner.email]);
    expect(invitations).toHaveLength(1);
  });

  it('hands the project over at their first sign-in', async () => {
    const project = await createProject(owner.id, 'Bogie');
    await addMember(project.id, 'manager@ehsim.example', 'editor', owner.id);

    // They sign in for the first time; the account exists only now.
    const manager = await makeVerifiedUser('manager@ehsim.example');
    const claimed = await claimInvitations(manager.id, manager.email!);

    expect(claimed).toBe(1);
    expect(await readableProjects(manager.id)).toContain(project.id);
    // With the role they were invited with, not a default one.
    expect(await canWrite(project.id, manager.id)).toBe(true);
  });

  it('gives nothing to an address that has not been proved', async () => {
    // The reason verification exists. An invitation is addressed by email, so
    // without proof, registering as somebody is a way to collect what was meant
    // for them.
    const project = await createProject(owner.id, 'Bogie');
    await addMember(project.id, 'manager@ehsim.example', 'editor', owner.id);

    const impostor = await makeUser('manager@ehsim.example');

    expect(await claimInvitations(impostor.id, impostor.email!)).toBe(0);
    expect(await readableProjects(impostor.id)).not.toContain(project.id);
    // And the invitation is still there, waiting for whoever can prove it.
    expect((await membersOf(project.id)).invitations).toHaveLength(1);
  });

  it('opens it once the address is proved', async () => {
    const project = await createProject(owner.id, 'Bogie');
    await addMember(project.id, 'manager@ehsim.example', 'viewer', owner.id);

    const manager = await makeUser('manager@ehsim.example');
    expect(await claimInvitations(manager.id, manager.email!)).toBe(0);

    // Following the link is what changes; nothing else needs to happen again.
    await db()
      .update(schema.users)
      .set({ emailVerified: new Date() })
      .where(eq(schema.users.id, manager.id));

    expect(await claimInvitations(manager.id, manager.email!)).toBe(1);
    expect(await readableProjects(manager.id)).toContain(project.id);
  });

  it('leaves nothing behind to be claimed twice', async () => {
    const project = await createProject(owner.id, 'Bogie');
    await addMember(project.id, 'manager@ehsim.example', 'viewer', owner.id);

    const manager = await makeVerifiedUser('manager@ehsim.example');
    await claimInvitations(manager.id, manager.email!);

    expect(await claimInvitations(manager.id, manager.email!)).toBe(0);
    expect((await membersOf(project.id)).invitations).toHaveLength(0);
  });

  it('gives nothing to a sign-in with no invitation waiting', async () => {
    const project = await createProject(owner.id, 'Bogie');
    await db()
      .update(schema.users)
      .set({ emailVerified: new Date() })
      .where(eq(schema.users.id, stranger.id));

    expect(await claimInvitations(stranger.id, stranger.email!)).toBe(0);
    expect(await readableProjects(stranger.id)).not.toContain(project.id);
  });
});

describe('taking access away', () => {
  it('closes the project again', async () => {
    const project = await createProject(owner.id, 'Bogie');
    await addMember(project.id, colleague.email!, 'editor', owner.id);
    expect(await readableProjects(colleague.id)).toContain(project.id);

    await removeMember(project.id, colleague.id);

    expect(await readableProjects(colleague.id)).not.toContain(project.id);
    expect(await canWrite(project.id, colleague.id)).toBe(false);
  });
});

describe('slugify', () => {
  it('keeps Turkish names readable instead of dropping their letters', () => {
    expect(slugify('Boşluksuz Kaplin')).toBe('bosluksuz-kaplin');
  });

  it('survives the dotted capital I', () => {
    // `'İ'.toLowerCase()` is two code points -- `i` and a combining dot above --
    // so lowercasing before transliterating turns the dot into a separator and
    // gives `i-c-govde`.
    expect(slugify('İÇ GÖVDE')).toBe('ic-govde');
    expect(slugify('İSTANBUL')).toBe('istanbul');
  });

  it('folds accents from any language rather than cutting them out', () => {
    expect(slugify('Précision Châssis')).toBe('precision-chassis');
  });

  it('always returns something a unique index can hold', () => {
    expect(slugify('***')).toBe('project');
    expect(slugify('')).toBe('project');
  });
});
