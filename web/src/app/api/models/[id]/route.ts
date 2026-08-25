import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/db';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const model = await db.query.models.findFirst({
    where: eq(schema.models.id, id),
    with: {
      versions: { orderBy: [desc(schema.modelVersions.versionNo)] },
    },
  });

  if (!model) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json({ model });
}
