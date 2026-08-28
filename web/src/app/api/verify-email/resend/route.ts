import { NextResponse } from 'next/server';

import { currentUser } from '@/lib/session';
import { sendVerification } from '@/lib/verification';

export const dynamic = 'force-dynamic';

/**
 * Send another confirmation link to the signed-in account's own address.
 *
 * Takes no address: it can only ever send to the person asking, which is what
 * stops it being a way to send mail to somebody else.
 */
export async function POST() {
  const user = await currentUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }

  await sendVerification(user.email);
  return NextResponse.json({ message: 'Sent. Check your inbox.' });
}
