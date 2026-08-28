/**
 * One-time links.
 *
 * A link that resets a password is a password until it expires, so it is
 * treated like one: generated from a cryptographic source, stored only as a
 * hash, given a short life, and destroyed the moment it is used.
 *
 * The hash here is a plain SHA-256 rather than the slow hash used for
 * passwords. That is deliberate and it is the one place the two differ: a
 * password is short and guessable and has to be expensive to test, while this
 * token is 32 random bytes and cannot be guessed at all, so the only thing a
 * slow hash would buy is a slow link.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';

import { db, schema } from '@/db';

export type TokenPurpose = (typeof schema.emailTokenPurposeEnum.enumValues)[number];

/** Long enough that a password reset link cannot be waited out, short enough to matter. */
export const LIFETIME_MINUTES = 60;

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Make a link token for an address.
 *
 * Any earlier token for the same address and purpose is dropped: asking for a
 * second reset link should not leave the first one working.
 */
export async function issueToken(email: string, purpose: TokenPurpose): Promise<string> {
  const address = email.trim().toLowerCase();
  const token = randomBytes(32).toString('base64url');

  await db
    .delete(schema.emailTokens)
    .where(
      and(eq(schema.emailTokens.email, address), eq(schema.emailTokens.purpose, purpose)),
    );

  await db.insert(schema.emailTokens).values({
    email: address,
    purpose,
    tokenHash: digest(token),
    expiresAt: new Date(Date.now() + LIFETIME_MINUTES * 60_000),
  });

  return token;
}

/**
 * The address a token belongs to, without spending it.
 *
 * For a caller that has to check something else before it can act -- whether
 * the new password is acceptable, say. Spending the link on a password that was
 * then refused would cost somebody their only way back into the account for the
 * sake of a typo, and buys nothing: whoever holds the link can already set any
 * password they like.
 */
export async function tokenEmail(
  token: string,
  purpose: TokenPurpose,
): Promise<string | null> {
  if (!token) return null;

  const row = await db.query.emailTokens.findFirst({
    where: and(
      eq(schema.emailTokens.tokenHash, digest(token)),
      eq(schema.emailTokens.purpose, purpose),
    ),
  });

  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return row.email;
}

/**
 * The address a token belongs to, consuming it, or null.
 *
 * Null for a token that never existed, has expired, or has already been used --
 * a caller cannot tell those apart, and neither can anyone holding an old link.
 */
export async function consumeToken(
  token: string,
  purpose: TokenPurpose,
): Promise<string | null> {
  if (!token) return null;

  const hash = digest(token);

  const row = await db.query.emailTokens.findFirst({
    where: and(eq(schema.emailTokens.tokenHash, hash), eq(schema.emailTokens.purpose, purpose)),
  });

  if (!row) return null;

  // Deleted whether or not it had expired: an expired token is spent too.
  await db.delete(schema.emailTokens).where(eq(schema.emailTokens.id, row.id));

  if (row.expiresAt.getTime() < Date.now()) return null;

  // The lookup was by hash, so this is belt and braces rather than the check
  // that matters -- but comparing digests in constant time costs nothing.
  const found = Buffer.from(row.tokenHash, 'hex');
  const expected = Buffer.from(hash, 'hex');
  if (found.length !== expected.length || !timingSafeEqual(found, expected)) return null;

  return row.email;
}

/**
 * Whether a link was sent to this address very recently.
 *
 * Asking for a reset link sends mail to somebody, and the person asking does
 * not have to be the person who receives it. Without this, the form is a way to
 * fill a stranger's inbox.
 */
export async function recentlyIssued(
  email: string,
  purpose: TokenPurpose,
  withinSeconds = 60,
): Promise<boolean> {
  const row = await db.query.emailTokens.findFirst({
    where: and(
      eq(schema.emailTokens.email, email.trim().toLowerCase()),
      eq(schema.emailTokens.purpose, purpose),
    ),
  });

  if (!row) return false;
  return Date.now() - row.createdAt.getTime() < withinSeconds * 1000;
}

/** Housekeeping: expired rows are of no use to anyone. */
export async function purgeExpiredTokens(): Promise<void> {
  await db.delete(schema.emailTokens).where(lt(schema.emailTokens.expiresAt, new Date()));
}
