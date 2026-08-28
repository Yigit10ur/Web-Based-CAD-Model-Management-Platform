import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db, schema } from '@/db';
import { normaliseEmail } from '@/lib/accounts';
import { issueToken, LIFETIME_MINUTES, recentlyIssued } from '@/lib/email-tokens';
import { sendMail, siteUrl } from '@/lib/mail';

export const dynamic = 'force-dynamic';

const schemaBody = z.object({ email: z.string().email() });

/**
 * Ask for a reset link.
 *
 * Answers the same way whatever happens: sent, not sent because there is no
 * such account, not sent because one went out a minute ago. The form is public,
 * so any difference in the answer is a way to ask whether an address has an
 * account here.
 */
export async function POST(request: Request) {
  const body = schemaBody.safeParse(await request.json().catch(() => null));

  // Even a malformed address gets the same sentence, for the same reason.
  if (body.success) {
    const address = normaliseEmail(body.data.email);

    const user = await db.query.users.findFirst({
      where: eq(schema.users.email, address),
    });

    if (user && !(await recentlyIssued(address, 'password_reset'))) {
      const token = await issueToken(address, 'password_reset');
      const link = `${siteUrl()}/reset-password?token=${encodeURIComponent(token)}`;

      await sendMail({
        to: address,
        subject: 'Reset your CAD Models password',
        text:
          `Someone asked to reset the password for this address.\n\n${link}\n\n` +
          `The link works once and expires in ${LIFETIME_MINUTES} minutes.\n\n` +
          `If it was not you, nothing has changed and you can ignore this.`,
      });
    }
  }

  return NextResponse.json({
    message: 'If that address has an account, a reset link is on its way.',
  });
}
