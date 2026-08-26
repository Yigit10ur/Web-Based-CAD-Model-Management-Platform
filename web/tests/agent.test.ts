/**
 * The translation agent's boundary.
 *
 * The agent runs outside this deployment, on a machine with an Inventor
 * licence, and authenticates with a shared token rather than a user session.
 * Two things must hold: an unauthenticated caller gets nothing, and two agents
 * polling at the same time never take the same file.
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

const TOKEN = 'a-token-long-enough-to-pass';

vi.mock('@/lib/env', () => ({
  env: () => ({ AGENT_TOKEN: TOKEN }),
}));

import * as schema from '@/db/schema';
import { agentAuthorised, claimTranslationJob, translatedKeyFor } from '@/lib/agent';

const db = () => holder.db;

function request(header?: string): Request {
  return new Request('http://localhost/api/agent/claim', {
    method: 'POST',
    headers: header ? { authorization: header } : {},
  });
}

async function seedVersion(status: 'awaiting_translation' | 'queued', name: string) {
  const [user] = await db()
    .insert(schema.users)
    .values({ email: `${name}@example.com` })
    .returning();
  const [project] = await db()
    .insert(schema.projects)
    .values({ ownerId: user.id, name, slug: name })
    .returning();
  const [model] = await db()
    .insert(schema.models)
    .values({ projectId: project.id, name })
    .returning();

  const [version] = await db()
    .insert(schema.modelVersions)
    .values({
      modelId: model.id,
      versionNo: 1,
      sourceKey: `${project.id}/${model.id}/v1/source.iam`,
      sourceFormat: 'iam',
      sourceSizeBytes: 2048,
      status,
    })
    .returning();

  return version;
}

beforeAll(async () => {
  holder.db = await createTestDatabase();
});

beforeEach(async () => {
  await db().delete(schema.modelVersions);
  await db().delete(schema.models);
  await db().delete(schema.projects);
  await db().delete(schema.users);
});

describe('agentAuthorised', () => {
  it('accepts the configured token', () => {
    expect(agentAuthorised(request(`Bearer ${TOKEN}`))).toBe(true);
  });

  it.each([
    ['no header', undefined],
    ['an empty bearer', 'Bearer '],
    ['the wrong token', 'Bearer not-the-configured-token'],
    ['a token of the right length but wrong value', `Bearer ${'x'.repeat(TOKEN.length)}`],
    ['the token without the scheme', TOKEN],
  ])('refuses %s', (_case, header) => {
    expect(agentAuthorised(request(header))).toBe(false);
  });
});

describe('claimTranslationJob', () => {
  it('takes a file that is waiting for translation', async () => {
    const version = await seedVersion('awaiting_translation', 'waiting');

    const job = await claimTranslationJob(db());
    expect(job?.id).toBe(version.id);

    const [after] = await db().select().from(schema.modelVersions);
    expect(after.status).toBe('translating');
    expect(after.claimedAt).not.toBeNull();
  });

  it('leaves files that are not waiting for it alone', async () => {
    await seedVersion('queued', 'notmine');

    // `queued` belongs to the converter's queue, not the agent's.
    expect(await claimTranslationJob(db())).toBeNull();
  });

  it('returns nothing when the queue is empty', async () => {
    expect(await claimTranslationJob(db())).toBeNull();
  });

  it('never hands the same file to two agents', async () => {
    await seedVersion('awaiting_translation', 'only');

    const [first, second] = await Promise.all([
      claimTranslationJob(db()),
      claimTranslationJob(db()),
    ]);

    // One of them gets it and the other gets nothing; both getting it would
    // mean the same assembly translated twice and reported twice.
    const claimed = [first, second].filter(Boolean);
    expect(claimed).toHaveLength(1);
  });

  it('takes the oldest file first', async () => {
    const first = await seedVersion('awaiting_translation', 'older');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await seedVersion('awaiting_translation', 'newer');

    expect((await claimTranslationJob(db()))?.id).toBe(first.id);
  });
});

describe('translatedKeyFor', () => {
  it('puts the STEP beside the file it came from', () => {
    expect(translatedKeyFor('proj/model/version/source.iam')).toBe(
      'proj/model/version/translated.step',
    );
  });
});
