/**
 * Passwords.
 *
 * Hashed with scrypt from `node:crypto`. It is memory-hard, it is in the
 * standard library, and it needs no native module -- which matters on a
 * serverless host, where a package that compiles on a laptop and not on the
 * deployment target is a deployment you find out about at the worst moment.
 *
 * The cost parameters are stored beside each hash rather than assumed, so that
 * raising them later does not invalidate the passwords already stored: an old
 * hash is still verifiable with the parameters it was made with.
 */

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

// promisify picks the overload without options, which is the one we cannot use.
const derive = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * ~100 ms and ~32 MB per attempt on a modern machine.
 *
 * The point is not to be slow for the person signing in -- they do it once --
 * but to make guessing a stolen table expensive per guess.
 */
const COST = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 32;

export const MINIMUM_LENGTH = 10;

async function scryptHash(password: string, salt: Buffer, cost: typeof COST) {
  return derive(password.normalize('NFKC'), salt, KEY_LENGTH, {
    ...cost,
    // scrypt needs to be told it may use the memory its own N implies.
    maxmem: 256 * cost.N * cost.r,
  });
}

/** `scrypt$N$r$p$salt$hash`, all base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptHash(password, salt, COST);

  return [
    'scrypt',
    COST.N,
    COST.r,
    COST.p,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

/**
 * Whether the password matches the stored hash.
 *
 * Never throws on a malformed or missing hash: a caller checking a password
 * against an account that has none must get `false`, not an exception that
 * behaves differently from a wrong password.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, N, r, p, salt, hash] = parts;
  const cost = { N: Number(N), r: Number(r), p: Number(p) };
  if (!Number.isInteger(cost.N) || !Number.isInteger(cost.r) || !Number.isInteger(cost.p)) {
    return false;
  }

  try {
    const expected = Buffer.from(hash, 'base64url');
    const actual = await scryptHash(password, Buffer.from(salt, 'base64url'), cost);

    // Lengths must match before timingSafeEqual, which throws otherwise.
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * A hash to check against when the account does not exist.
 *
 * Answering an unknown address quickly and a known one slowly tells an attacker
 * which addresses are worth attacking. Verifying against this instead costs the
 * same as a real attempt.
 */
export const DUMMY_HASH =
  'scrypt$32768$8$1$' +
  'Zm9yLXRpbWluZy1vbmx5LW5vdC1hLXJlYWwtc2FsdC0wMDAwMA$' +
  'bm90LWEtcmVhbC1oYXNoLXRoaXMtbmV2ZXItbWF0Y2hlcy1hbnl0aGluZy1ldmVyLTAwMDAwMDAw';

/** Why a password is not acceptable, or null. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < MINIMUM_LENGTH) {
    return `Use at least ${MINIMUM_LENGTH} characters.`;
  }

  // Length is what makes a password hard to guess; composition rules mostly
  // make it hard to remember. NIST dropped them in 800-63B for that reason.
  // What is worth refusing is a password that is already public knowledge or
  // that anyone who knows the person could guess.
  const folded = password.toLowerCase();
  const local = email.split('@')[0]?.toLowerCase();

  if (local && local.length > 2 && folded.includes(local)) {
    return 'Do not use your email address in your password.';
  }

  const OBVIOUS = [
    'password', 'qwerty', '11111111', '12345678', '123456789', '1234567890',
    'letmein', 'welcome', 'admin123', 'iloveyou', 'sifre', 'parola',
  ];
  if (OBVIOUS.some((bad) => folded.includes(bad))) {
    return 'That password is too easy to guess.';
  }

  return null;
}
