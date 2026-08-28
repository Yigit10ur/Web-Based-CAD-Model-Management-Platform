/**
 * Slowing down password guessing.
 *
 * A password only has to survive being guessed, and online guessing is stopped
 * by refusing to answer quickly rather than by making the password exotic. The
 * counter lives in the database because a serverless host keeps nothing between
 * requests: an in-memory limiter there counts each instance separately, which
 * is the same as not counting.
 */

import { and, eq, gte, sql } from 'drizzle-orm';

import { db, schema } from '@/db';

/** Failures allowed before an address stops being answered. */
export const LIMIT = 10;

/** How far back failures count, and how long a locked address stays locked. */
export const WINDOW_MINUTES = 15;

function since() {
  return new Date(Date.now() - WINDOW_MINUTES * 60_000);
}

export async function isLockedOut(email: string): Promise<boolean> {
  const [row] = await db
    .select({ failures: sql<number>`count(*)::int` })
    .from(schema.signInAttempts)
    .where(
      and(
        eq(schema.signInAttempts.email, email),
        gte(schema.signInAttempts.at, since()),
      ),
    );

  return (row?.failures ?? 0) >= LIMIT;
}

export async function recordFailure(email: string): Promise<void> {
  await db.insert(schema.signInAttempts).values({ email });
}

/**
 * Forget an address's failures.
 *
 * Called on a successful sign-in: someone who has just proved they own the
 * account should not be locked out by the typos they made getting there.
 */
export async function clearFailures(email: string): Promise<void> {
  await db.delete(schema.signInAttempts).where(eq(schema.signInAttempts.email, email));
}
