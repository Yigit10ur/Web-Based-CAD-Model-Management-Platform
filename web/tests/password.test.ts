/**
 * Password hashing.
 *
 * These are the rules that decide what a stolen database is worth, so they are
 * tested for the properties that matter rather than for their output: a hash
 * that verifies is not enough if every account shares a salt, or if a wrong
 * password can be told from an unknown one by how long the answer takes.
 */

import { describe, expect, it } from 'vitest';

import {
  DUMMY_HASH,
  MINIMUM_LENGTH,
  hashPassword,
  passwordProblem,
  verifyPassword,
} from '@/lib/password';

const GOOD = 'iki kere iki dort eder';

describe('hashing', () => {
  it('accepts the password it was given', async () => {
    expect(await verifyPassword(GOOD, await hashPassword(GOOD))).toBe(true);
  });

  it('refuses anything else', async () => {
    const stored = await hashPassword(GOOD);

    expect(await verifyPassword(GOOD + ' ', stored)).toBe(false);
    expect(await verifyPassword('iki kere iki bes eder', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('salts every hash separately', async () => {
    // Otherwise one lookup table breaks every account that chose the same
    // password, and identical hashes tell an attacker who shares one.
    const [first, second] = [await hashPassword(GOOD), await hashPassword(GOOD)];

    expect(first).not.toBe(second);
    expect(await verifyPassword(GOOD, first)).toBe(true);
    expect(await verifyPassword(GOOD, second)).toBe(true);
  });

  it('carries its own cost, so old hashes survive a change of parameters', async () => {
    const stored = await hashPassword(GOOD);
    const [scheme, n, r, p] = stored.split('$');

    expect(scheme).toBe('scrypt');
    expect([Number(n), Number(r), Number(p)]).toEqual([32768, 8, 1]);
  });

  it('answers false rather than throwing on a hash it cannot read', async () => {
    // An account with no password is a normal thing here -- GitHub accounts
    // have none -- and it has to behave like a wrong password, not like a bug.
    for (const stored of [null, '', 'not-a-hash', 'scrypt$1$2$3', 'bcrypt$a$b$c$d$e']) {
      expect(await verifyPassword(GOOD, stored)).toBe(false);
    }
  });

  it('never matches the placeholder used for unknown accounts', async () => {
    for (const attempt of [GOOD, '', 'password', DUMMY_HASH]) {
      expect(await verifyPassword(attempt, DUMMY_HASH)).toBe(false);
    }
  });

  it('costs an unknown account the same as a real one', async () => {
    // If an address that does not exist is answered faster, the answer itself
    // is a list of which addresses are worth attacking.
    const stored = await hashPassword(GOOD);

    const timed = async (hash: string) => {
      const started = performance.now();
      await verifyPassword('some guess', hash);
      return performance.now() - started;
    };

    const real = await timed(stored);
    const dummy = await timed(DUMMY_HASH);

    // Generous: this is a smoke test for "same order of magnitude", not a
    // constant-time proof, and CI machines are noisy.
    expect(dummy).toBeGreaterThan(real / 4);
    expect(dummy).toBeLessThan(real * 4);
  });
});

describe('what is refused', () => {
  it('refuses a short password', () => {
    expect(passwordProblem('short', 'a@b.com')).toMatch(/at least/);
    expect(passwordProblem('x'.repeat(MINIMUM_LENGTH - 1), 'a@b.com')).not.toBeNull();
    expect(passwordProblem('x'.repeat(MINIMUM_LENGTH), 'a@b.com')).toBeNull();
  });

  it('refuses the password everyone tries first', () => {
    for (const bad of ['password123', 'qwertyuiop', 'MyPassword1', '1234567890', 'sifre1234']) {
      expect(passwordProblem(bad, 'a@b.com')).not.toBeNull();
    }
  });

  it('refuses a password built from the address', () => {
    expect(passwordProblem('yigit-yigit-yigit', 'yigit@ehsim.com')).toMatch(/email/);
    // Two letters is not a name, and refusing it would refuse half of everything.
    expect(passwordProblem('a valid enough phrase', 'ab@ehsim.com')).toBeNull();
  });

  it('does not refuse a long passphrase for containing a common word', () => {
    // Found by using the reset form: `yeni bir uzun parola` was refused because
    // it contains `parola`. A rule that refuses good passphrases is how people
    // end up choosing worse ones.
    expect(passwordProblem('yeni bir uzun parola', 'a@b.com')).toBeNull();
    expect(passwordProblem('my password is a long one', 'a@b.com')).toBeNull();

    // Still refused, because there the common word is most of what is there.
    expect(passwordProblem('password123', 'a@b.com')).not.toBeNull();
    expect(passwordProblem('qwertyuiop', 'a@b.com')).not.toBeNull();
  });

  it('accepts length instead of demanding punctuation', () => {
    // Composition rules make passwords hard to remember more than hard to
    // guess; NIST 800-63B dropped them for that reason.
    expect(passwordProblem('correct horse battery staple', 'a@b.com')).toBeNull();
    expect(passwordProblem('dokuz on bir yirmi', 'a@b.com')).toBeNull();
  });
});
