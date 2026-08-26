import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/db';
import { needsTranslation } from '@/lib/formats';
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

  const target = await writableVersion(id, user.id);
  if (!target) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // A native Inventor file cannot be read here at all. It waits for the
  // translation agent instead of joining the converter's queue, where it would
  // only fail.
  const next = needsTranslation(target.sourceKey) ? 'awaiting_translation' : 'queued';

  const [version] = await db
    .update(schema.modelVersions)
    .set({ status: next })
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
