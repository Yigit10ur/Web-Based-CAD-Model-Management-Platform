import { NextResponse } from 'next/server';
import { z } from 'zod';

import { registerUser } from '@/lib/accounts';
import { MINIMUM_LENGTH } from '@/lib/password';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(MINIMUM_LENGTH).max(200),
  name: z.string().max(120).optional(),
});

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return NextResponse.json(
      { error: `A valid email and a password of at least ${MINIMUM_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const result = await registerUser(body.data.email, body.data.password, body.data.name);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // No session here: the client signs in with the password it already has, so
  // there is one code path that starts a session rather than two.
  return NextResponse.json({ user: result.user }, { status: 201 });
}
