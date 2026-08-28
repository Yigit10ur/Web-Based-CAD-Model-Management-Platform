/**
 * Registering and signing in.
 *
 * The rules here decide who gets to be somebody, so the cases below are the
 * ones where being wrong is dangerous rather than annoying: taking over an
 * account that signs in through GitHub, telling an attacker which addresses
 * exist, and guessing a password one request at a time.
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
  passwordSignInEnabled: true,
}));

import * as schema from '@/db/schema';
import { authenticate, registerUser } from '@/lib/accounts';
import { LIMIT } from '@/lib/sign-in-attempts';

const db = () => holder.db;

const EMAIL = 'engineer@ehsim.example';
const PASSWORD = 'iki kere iki dort eder';

beforeAll(async () => {
  holder.db = await createTestDatabase();
});

beforeEach(async () => {
  await db().delete(schema.signInAttempts);
  await db().delete(schema.users);
});

describe('registering', () => {
  it('stores a hash, never the password', async () => {
    const result = await registerUser(EMAIL, PASSWORD);
    expect(result.ok).toBe(true);

    const [user] = await db().select().from(schema.users);
    expect(user.passwordHash).toBeTruthy();
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(user.passwordHash!.startsWith('scrypt$')).toBe(true);
  });

  it('treats the address as case and space insensitive', async () => {
    await registerUser('  Engineer@EHSIM.example  ', PASSWORD);

    const [user] = await db().select().from(schema.users);
    expect(user.email).toBe(EMAIL);
    expect(await authenticate('ENGINEER@ehsim.example', PASSWORD)).not.toBeNull();
  });

  it('refuses an address that is already taken', async () => {
    await registerUser(EMAIL, PASSWORD);
    const again = await registerUser(EMAIL, 'a completely different phrase');

    expect(again).toEqual({ ok: false, error: 'That email is already registered.' });
  });

  it('cannot put a password on an account that signs in through GitHub', async () => {
    // The dangerous case: that account has no password, so if registering set
    // one, anyone who knew the address could walk in.
    await db().insert(schema.users).values({ email: EMAIL, name: 'via GitHub' });

    const result = await registerUser(EMAIL, PASSWORD);

    expect(result.ok).toBe(false);
    const [user] = await db().select().from(schema.users);
    expect(user.passwordHash).toBeNull();
    expect(await authenticate(EMAIL, PASSWORD)).toBeNull();
  });

  it('refuses a password that would not survive guessing', async () => {
    expect(await registerUser(EMAIL, 'short')).toEqual({
      ok: false,
      error: expect.stringMatching(/at least/),
    });
    expect(await db().select().from(schema.users)).toHaveLength(0);
  });
});

describe('signing in', () => {
  beforeEach(async () => {
    await registerUser(EMAIL, PASSWORD, 'Engineer');
  });

  it('lets the right password in', async () => {
    const user = await authenticate(EMAIL, PASSWORD);
    expect(user?.email).toBe(EMAIL);
    expect(user?.name).toBe('Engineer');
  });

  it('gives the same answer to a wrong password and an unknown address', async () => {
    expect(await authenticate(EMAIL, 'not the password')).toBeNull();
    expect(await authenticate('nobody@ehsim.example', PASSWORD)).toBeNull();
  });

  it('refuses an empty password against an account that has one', async () => {
    expect(await authenticate(EMAIL, '')).toBeNull();
  });
});

describe('guessing', () => {
  beforeEach(async () => {
    await registerUser(EMAIL, PASSWORD);
  });

  it('stops answering an address after too many failures', async () => {
    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      expect(await authenticate(EMAIL, `guess ${attempt}`)).toBeNull();
    }

    // Even the real password: the point is to stop the guessing, and an
    // attacker who has just found it would otherwise be let straight in.
    expect(await authenticate(EMAIL, PASSWORD)).toBeNull();
  });

  it('counts addresses separately', async () => {
    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      await authenticate('someone-else@ehsim.example', `guess ${attempt}`);
    }

    expect(await authenticate(EMAIL, PASSWORD)).not.toBeNull();
  });

  it('forgives the typos someone made on the way in', async () => {
    for (let attempt = 0; attempt < LIMIT - 1; attempt += 1) {
      await authenticate(EMAIL, 'wrong');
    }

    expect(await authenticate(EMAIL, PASSWORD)).not.toBeNull();

    // Having proved they own it, the earlier failures no longer count.
    for (let attempt = 0; attempt < LIMIT - 1; attempt += 1) {
      await authenticate(EMAIL, 'wrong');
    }
    expect(await authenticate(EMAIL, PASSWORD)).not.toBeNull();
  });

  it('counts failures against an address that does not exist', async () => {
    // Otherwise enumerating addresses is free.
    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      await authenticate('nobody@ehsim.example', `guess ${attempt}`);
    }

    const rows = await db().select().from(schema.signInAttempts);
    expect(rows.length).toBeGreaterThanOrEqual(LIMIT);
  });
});
