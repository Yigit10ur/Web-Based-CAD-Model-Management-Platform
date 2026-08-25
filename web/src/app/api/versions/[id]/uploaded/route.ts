import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/db';
import { currentUser, writableVersion } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * The client reports that its upload finished; the version joins the queue.
 *
 * Guarded on the current status so a repeated call cannot drag a version that
 * is already converting, or already converted, back to the start of the queue.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const { id } = await params;

  if (!(await writableVersion(id, user.id))) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const [version] = await db
    .update(schema.modelVersions)
    .set({ status: 'queued' })
    .where(
      and(eq(schema.modelVersions.id, id), eq(schema.modelVersions.status, 'uploading')),
    )
    .returning();

  if (!version) {
    const existing = await db.query.modelVersions.findFirst({
      where: eq(schema.modelVersions.id, id),
    });

    if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ version: existing });
  }

  return NextResponse.json({ version });
}
