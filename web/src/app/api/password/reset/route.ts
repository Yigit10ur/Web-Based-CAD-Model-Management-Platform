import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db, schema } from '@/db';
import { consumeToken, tokenEmail } from '@/lib/email-tokens';
import { hashPassword, MINIMUM_LENGTH, passwordProblem } from '@/lib/password';
import { clearFailures } from '@/lib/sign-in-attempts';

export const dynamic = 'force-dynamic';

const schemaBody = z.object({
  token: z.string().min(1),
  password: z.string().min(MINIMUM_LENGTH).max(200),
});

export async function POST(request: Request) {
  const body = schemaBody.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return NextResponse.json(
      { error: `Choose a password of at least ${MINIMUM_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const expired = () =>
    NextResponse.json(
      { error: 'That link has expired or has already been used. Ask for a new one.' },
      { status: 400 },
    );

  // Read without spending, so that a password this refuses does not also cost
  // the person their only way back in.
  const email = await tokenEmail(body.data.token, 'password_reset');
  if (!email) return expired();

  const problem = passwordProblem(body.data.password, email);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  // Spent only now that the password will actually be set. Two requests racing
  // here means the second one finds nothing to spend and is told to ask again,
  // which is the right answer.
  if (!(await consumeToken(body.data.token, 'password_reset'))) return expired();

  await db
    .update(schema.users)
    .set({
      passwordHash: await hashPassword(body.data.password),
      // Following a link proves the address is read by whoever followed it.
      emailVerified: new Date(),
    })
    .where(eq(schema.users.email, email));

  // Whoever was locked out by the guessing that led here should not stay locked
  // out now that the password is theirs again.
  await clearFailures(email);

  return NextResponse.json({ email });
}
