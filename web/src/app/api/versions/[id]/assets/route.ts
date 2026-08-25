import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/db';
import { presignDownload } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Short-lived URLs for the files the viewer needs.
 *
 * The original CAD file is not included: the viewer never reads it, and
 * handing it out here would make every viewer a download link.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const version = await db.query.modelVersions.findFirst({
    where: eq(schema.modelVersions.id, id),
  });

  if (!version) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (version.status !== 'ready' || !version.glbKey || !version.metadataKey) {
    return NextResponse.json(
      { error: 'not converted yet', status: version.status },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: version.status,
    glb: await presignDownload(version.glbKey),
    metadata: await presignDownload(version.metadataKey),
    thumbnail: version.thumbnailKey ? await presignDownload(version.thumbnailKey) : null,
    stats: version.stats,
  });
}
