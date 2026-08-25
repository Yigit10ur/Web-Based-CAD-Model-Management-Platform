import { NextResponse } from 'next/server';

import { currentUser, readableModel } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const { id } = await params;
  const model = await readableModel(id, user.id);

  // Not found rather than forbidden: confirming that a model exists but
  // belongs to someone else is more than the caller needs to know.
  if (!model) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json({ model });
}
