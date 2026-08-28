/**
 * Registering, and proving who you are with a password.
 *
 * Kept apart from `auth.ts` so that the rules can be tested without standing up
 * Auth.js, and so that the two things that must agree -- what registration
 * accepts and what sign-in checks -- are readable side by side.
 */

import { eq } from 'drizzle-orm';

import { db, schema } from '@/db';
import { DUMMY_HASH, hashPassword, passwordProblem, verifyPassword } from '@/lib/password';
import { clearFailures, isLockedOut, recordFailure } from '@/lib/sign-in-attempts';

export type Registration =
  | { ok: true; user: { id: string; email: string | null; name: string | null } }
  | { ok: false; error: string };

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function registerUser(
  email: string,
  password: string,
  name?: string,
): Promise<Registration> {
  const address = normaliseEmail(email);

  const problem = passwordProblem(password, address);
  if (problem) return { ok: false, error: problem };

  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, address),
  });

  // Refused rather than given a password. Otherwise registering with the
  // address of an account that signs in through GitHub would be a way to take
  // that account over.
  if (existing) return { ok: false, error: 'That email is already registered.' };

  const [user] = await db
    .insert(schema.users)
    .values({
      email: address,
      name: name?.trim() || address.split('@')[0],
      passwordHash: await hashPassword(password),
    })
    .returning();

  return { ok: true, user: { id: user.id, email: user.email, name: user.name } };
}

/**
 * The account this password belongs to, or null.
 *
 * Null for every kind of failure -- no such address, wrong password, an account
 * that has no password because it signs in through GitHub, too many recent
 * attempts. The caller cannot tell them apart, and neither can anyone else:
 * "no such account" and "wrong password" are the same sentence, and both take
 * the same time to say, because an unknown address is still checked against a
 * hash that cannot match.
 */
export async function authenticate(email: string, password: string) {
  const address = normaliseEmail(email);
  if (!address || !password) return null;

  if (await isLockedOut(address)) return null;

  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, address),
  });

  const matches = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !matches) {
    await recordFailure(address);
    return null;
  }

  await clearFailures(address);
  return { id: user.id, email: user.email, name: user.name, image: user.image };
}
