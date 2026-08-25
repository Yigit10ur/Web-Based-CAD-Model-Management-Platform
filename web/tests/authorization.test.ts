/**
 * The access rules.
 *
 * These are the only rules in the codebase where a mistake is dangerous rather
 * than annoying: a model id is a uuid in a URL, and before the access helpers
 * existed anyone holding one could read any model in the database. The cases
 * below are the ones that were verified by hand when the rules were written;
 * having them here is what stops a later refactor from quietly undoing that.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDatabase } from './db';

// The mock factory is hoisted above the imports, so the database it hands out
// has to be reachable through a container that exists by then and is filled in
// later.
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

// The rules under test take a user id directly; none of them ask who is signed
// in. Stubbing Auth.js keeps its construction out of the test run entirely.
vi.mock('@/auth', () => ({
  auth: vi.fn(async () => null),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
  githubEnabled: false,
  devSignInEnabled: true,
}));

import * as schema from '@/db/schema';
import {
  personalProject,
  readableModel,
  readableProjects,
  readableVersion,
  writableModel,
  writableVersion,
} from '@/lib/session';

/**
 * The tests write their fixtures straight to the test database.
 *
 * Reached through the holder rather than through the mocked module: a
 * destructured import would capture the getter's value once, while the
 * database is still being built.
 */
const db = () => holder.db;

async function makeUser(email: string) {
  const [user] = await db().insert(schema.users).values({ email }).returning();
  return user;
}

async function makeProject(
  ownerId: string,
  slug: string,
  visibility: 'private' | 'public' = 'private',
) {
  const [project] = await db()
    .insert(schema.projects)
    .values({ ownerId, name: slug, slug, visibility })
    .returning();

  await db()
    .insert(schema.projectMembers)
    .values({ projectId: project.id, userId: ownerId, role: 'owner' });

  return project;
}

async function makeModel(projectId: string, createdBy: string) {
  const [model] = await db()
    .insert(schema.models)
    .values({ projectId, name: 'bracket' })
    .returning();

  const [version] = await db()
    .insert(schema.modelVersions)
    .values({
      modelId: model.id,
      versionNo: 1,
      sourceKey: `${projectId}/${model.id}/v1/source.step`,
      sourceFormat: 'step',
      sourceSizeBytes: 1024,
      createdBy,
    })
    .returning();

  return { model, version };
}

let owner: Awaited<ReturnType<typeof makeUser>>;
let stranger: Awaited<ReturnType<typeof makeUser>>;
let editor: Awaited<ReturnType<typeof makeUser>>;
let viewer: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  holder.db = await createTestDatabase();
});

beforeEach(async () => {
  // Truncating rather than recreating: building a fresh Postgres per test
  // would dominate the runtime.
  await db().delete(schema.modelVersions);
  await db().delete(schema.models);
  await db().delete(schema.projectMembers);
  await db().delete(schema.projects);
  await db().delete(schema.users);

  owner = await makeUser('owner@example.com');
  stranger = await makeUser('stranger@example.com');
  editor = await makeUser('editor@example.com');
  viewer = await makeUser('viewer@example.com');
});

describe('personalProject', () => {
  it('creates a project the first time and returns the same one after', async () => {
    const first = await personalProject(owner.id);
    const second = await personalProject(owner.id);

    expect(second).toBe(first);

    const projects = await db().select().from(schema.projects);
    expect(projects).toHaveLength(1);
  });

  it('makes the user the owner of it', async () => {
    const projectId = await personalProject(owner.id);
    const members = await db().select().from(schema.projectMembers);

    expect(members).toEqual([
      expect.objectContaining({ projectId, userId: owner.id, role: 'owner' }),
    ]);
  });
});

describe('readableProjects', () => {
  it('includes projects the user owns', async () => {
    const project = await makeProject(owner.id, 'mine');
    expect(await readableProjects(owner.id)).toContain(project.id);
  });

  it('excludes private projects belonging to someone else', async () => {
    const project = await makeProject(owner.id, 'mine');
    expect(await readableProjects(stranger.id)).not.toContain(project.id);
  });

  it('includes a project the user is a member of', async () => {
    const project = await makeProject(owner.id, 'shared');
    await db()
      .insert(schema.projectMembers)
      .values({ projectId: project.id, userId: viewer.id, role: 'viewer' });

    expect(await readableProjects(viewer.id)).toContain(project.id);
  });

  it('includes public projects for anyone', async () => {
    const project = await makeProject(owner.id, 'open', 'public');
    expect(await readableProjects(stranger.id)).toContain(project.id);
  });
});

describe('readableModel', () => {
  it('lets the owner read their own model', async () => {
    const project = await makeProject(owner.id, 'mine');
    const { model } = await makeModel(project.id, owner.id);

    expect(await readableModel(model.id, owner.id)).not.toBeNull();
  });

  it('refuses a stranger holding the id', async () => {
    const project = await makeProject(owner.id, 'mine');
    const { model } = await makeModel(project.id, owner.id);

    // The whole point: knowing the uuid is not permission to read it.
    expect(await readableModel(model.id, stranger.id)).toBeNull();
  });

  it('lets anyone read a model in a public project', async () => {
    const project = await makeProject(owner.id, 'open', 'public');
    const { model } = await makeModel(project.id, owner.id);

    expect(await readableModel(model.id, stranger.id)).not.toBeNull();
  });

  it('returns null for an id that does not exist', async () => {
    expect(
      await readableModel('00000000-0000-0000-0000-000000000000', owner.id),
    ).toBeNull();
  });
});

describe('writableModel', () => {
  it('allows the owner', async () => {
    const project = await makeProject(owner.id, 'mine');
    const { model } = await makeModel(project.id, owner.id);

    expect(await writableModel(model.id, owner.id)).not.toBeNull();
  });

  it('allows an editor', async () => {
    const project = await makeProject(owner.id, 'shared');
    await db()
      .insert(schema.projectMembers)
      .values({ projectId: project.id, userId: editor.id, role: 'editor' });
    const { model } = await makeModel(project.id, owner.id);

    expect(await writableModel(model.id, editor.id)).not.toBeNull();
  });

  it('refuses a viewer', async () => {
    const project = await makeProject(owner.id, 'shared');
    await db()
      .insert(schema.projectMembers)
      .values({ projectId: project.id, userId: viewer.id, role: 'viewer' });
    const { model } = await makeModel(project.id, owner.id);

    // A viewer may open a model and may not push a revision over it.
    expect(await readableModel(model.id, viewer.id)).not.toBeNull();
    expect(await writableModel(model.id, viewer.id)).toBeNull();
  });

  it('refuses a stranger even when the project is public', async () => {
    const project = await makeProject(owner.id, 'open', 'public');
    const { model } = await makeModel(project.id, owner.id);

    // Public means readable, never writable.
    expect(await readableModel(model.id, stranger.id)).not.toBeNull();
    expect(await writableModel(model.id, stranger.id)).toBeNull();
  });
});

describe('readableVersion', () => {
  it('follows the permission of the model it belongs to', async () => {
    const project = await makeProject(owner.id, 'mine');
    const { version } = await makeModel(project.id, owner.id);

    expect(await readableVersion(version.id, owner.id)).not.toBeNull();
    // This is the check that matters most: a readable version is signed into a
    // download URL, so getting it wrong hands over the model itself.
    expect(await readableVersion(version.id, stranger.id)).toBeNull();
  });
});

describe('writableVersion', () => {
  it('refuses a viewer and a stranger', async () => {
    const project = await makeProject(owner.id, 'shared');
    await db()
      .insert(schema.projectMembers)
      .values({ projectId: project.id, userId: viewer.id, role: 'viewer' });
    const { version } = await makeModel(project.id, owner.id);

    expect(await writableVersion(version.id, owner.id)).not.toBeNull();
    expect(await writableVersion(version.id, viewer.id)).toBeNull();
    expect(await writableVersion(version.id, stranger.id)).toBeNull();
  });
});
