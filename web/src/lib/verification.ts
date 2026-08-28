/**
 * Proving that an address belongs to whoever registered it.
 *
 * The reason this exists is sharing: an invitation is addressed to a person by
 * their email, so without proof, registering as a colleague would be a way to
 * collect what was meant for them. See `claimInvitations`.
 */

import { eq } from 'drizzle-orm';

import { db, schema } from '@/db';
import { consumeToken, issueToken, LIFETIME_MINUTES, recentlyIssued } from '@/lib/email-tokens';
import { sendMail, siteUrl } from '@/lib/mail';
import { claimInvitations } from '@/lib/projects';

/**
 * Send a link that proves the address, unless one went out moments ago.
 *
 * Returns quietly either way. A caller is usually in the middle of something
 * else -- finishing a registration -- and the message is not the thing the
 * person is waiting for.
 */
export async function sendVerification(email: string): Promise<void> {
  const address = email.trim().toLowerCase();

  if (await recentlyIssued(address, 'email_verification')) return;

  const token = await issueToken(address, 'email_verification');
  const link = `${siteUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  await sendMail({
    to: address,
    subject: 'Confirm your email address',
    text:
      `Open this to confirm that this address is yours:\n\n${link}\n\n` +
      `The link works once and expires in ${LIFETIME_MINUTES} minutes.\n\n` +
      `Until an address is confirmed, projects shared with it stay closed.`,
  });
}

export type VerificationResult =
  | { ok: true; email: string; claimed: number }
  | { ok: false };

/**
 * Accept a link, and open whatever was waiting for that address.
 *
 * Claiming here as well as at sign-in is the point: somebody invited before
 * they registered has an invitation that could not be opened until now.
 */
export async function verifyEmail(token: string): Promise<VerificationResult> {
  const email = await consumeToken(token, 'email_verification');
  if (!email) return { ok: false };

  const [user] = await db
    .update(schema.users)
    .set({ emailVerified: new Date() })
    .where(eq(schema.users.email, email))
    .returning();

  if (!user) return { ok: false };

  const claimed = await claimInvitations(user.id, email);
  return { ok: true, email, claimed };
}
