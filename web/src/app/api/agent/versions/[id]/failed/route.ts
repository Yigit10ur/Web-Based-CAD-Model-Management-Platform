import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db, schema } from '@/db';
import { agentAuthorised } from '@/lib/agent';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ message: z.string().max(2000) });

/** Inventor could not open or export the file; say so instead of retrying forever. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!agentAuthorised(request)) {
    return NextResponse.json({ error: 'not authorised' }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues }, { status: 400 });
  }

  const { id } = await params;

  const [version] = await db
    .update(schema.modelVersions)
    .set({ status: 'failed', errorMessage: body.data.message, claimedAt: null })
    .where(
      and(eq(schema.modelVersions.id, id), eq(schema.modelVersions.status, 'translating')),
    )
    .returning();

  if (!version) return NextResponse.json({ error: 'not claimed' }, { status: 409 });

  return NextResponse.json({ version });
}
