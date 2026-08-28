/**
 * One-time links.
 *
 * A reset link is a password for as long as it lives, so the cases below are
 * the ones where being wrong hands somebody an account: a link that works
 * twice, a link that outlives its welcome, a link readable straight out of the
 * database, or an old link that a new one failed to retire.
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

import { createHash } from 'node:crypto';

import * as schema from '@/db/schema';
import {
  consumeToken,
  issueToken,
  purgeExpiredTokens,
  recentlyIssued,
  tokenEmail,
} from '@/lib/email-tokens';

const db = () => holder.db;
const EMAIL = 'engineer@ehsim.example';

beforeAll(async () => {
  holder.db = await createTestDatabase();
});

beforeEach(async () => {
  await db().delete(schema.emailTokens);
});

describe('issuing', () => {
  it('never stores the token it hands out', async () => {
    // A database that can be read must not be a source of working links.
    const token = await issueToken(EMAIL, 'password_reset');
    const [row] = await db().select().from(schema.emailTokens);

    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
  });

  it('hands out a different token every time', async () => {
    const first = await issueToken(EMAIL, 'password_reset');
    const second = await issueToken(EMAIL, 'password_reset');

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThan(30);
  });

  it('retires the previous link for the same purpose', async () => {
    // Asking for a second link should not leave the first one working: the
    // reason people ask twice is usually that the first went somewhere wrong.
    const first = await issueToken(EMAIL, 'password_reset');
    const second = await issueToken(EMAIL, 'password_reset');

    expect(await consumeToken(first, 'password_reset')).toBeNull();
    expect(await consumeToken(second, 'password_reset')).toBe(EMAIL);
  });

  it('keeps the two purposes apart', async () => {
    const reset = await issueToken(EMAIL, 'password_reset');
    await issueToken(EMAIL, 'email_verification');

    // A link that proves an address must not also set a password.
    expect(await consumeToken(reset, 'email_verification')).toBeNull();
    expect(await consumeToken(reset, 'password_reset')).toBe(EMAIL);
  });

  it('lowercases the address it belongs to', async () => {
    const token = await issueToken('  Engineer@EHSIM.example ', 'password_reset');
    expect(await consumeToken(token, 'password_reset')).toBe(EMAIL);
  });
});

describe('consuming', () => {
  it('works once', async () => {
    const token = await issueToken(EMAIL, 'password_reset');

    expect(await consumeToken(token, 'password_reset')).toBe(EMAIL);
    expect(await consumeToken(token, 'password_reset')).toBeNull();
    expect(await db().select().from(schema.emailTokens)).toHaveLength(0);
  });

  it('can be read without being spent', async () => {
    // Found by using the reset form: the first password was refused, and the
    // link had already been burned checking it. A caller that has to validate
    // something before acting reads first and spends afterwards.
    const token = await issueToken(EMAIL, 'password_reset');

    expect(await tokenEmail(token, 'password_reset')).toBe(EMAIL);
    expect(await tokenEmail(token, 'password_reset')).toBe(EMAIL);
    expect(await consumeToken(token, 'password_reset')).toBe(EMAIL);
    expect(await tokenEmail(token, 'password_reset')).toBeNull();
  });

  it('does not read an expired token either', async () => {
    const token = await issueToken(EMAIL, 'password_reset');
    await db()
      .update(schema.emailTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    expect(await tokenEmail(token, 'password_reset')).toBeNull();
  });

  it('refuses a token that was never issued', async () => {
    for (const nonsense of ['', 'not-a-token', 'x'.repeat(43)]) {
      expect(await consumeToken(nonsense, 'password_reset')).toBeNull();
    }
  });

  it('refuses an expired token, and spends it anyway', async () => {
    const token = await issueToken(EMAIL, 'password_reset');
    await db()
      .update(schema.emailTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    expect(await consumeToken(token, 'password_reset')).toBeNull();
    // Gone rather than left lying about: it is of no use to its owner either.
    expect(await db().select().from(schema.emailTokens)).toHaveLength(0);
  });
});

describe('not filling a stranger inbox', () => {
  it('reports a link sent moments ago', async () => {
    expect(await recentlyIssued(EMAIL, 'password_reset')).toBe(false);

    await issueToken(EMAIL, 'password_reset');
    expect(await recentlyIssued(EMAIL, 'password_reset')).toBe(true);

    // The address is public knowledge; the form must not be a way to send mail
    // to it repeatedly.
    expect(await recentlyIssued('someone-else@ehsim.example', 'password_reset')).toBe(false);
  });

  it('stops reporting once the window has passed', async () => {
    await issueToken(EMAIL, 'password_reset');
    await db()
      .update(schema.emailTokens)
      .set({ createdAt: new Date(Date.now() - 120_000) });

    expect(await recentlyIssued(EMAIL, 'password_reset')).toBe(false);
  });
});

describe('housekeeping', () => {
  it('clears out what has expired and keeps what has not', async () => {
    await issueToken('expired@ehsim.example', 'password_reset');
    await db()
      .update(schema.emailTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) });
    await issueToken('current@ehsim.example', 'password_reset');

    await purgeExpiredTokens();

    const rows = await db().select().from(schema.emailTokens);
    expect(rows.map((row) => row.email)).toEqual(['current@ehsim.example']);
  });
});
