import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db, schema } from '@/db';
import { agentAuthorised } from '@/lib/agent';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ translatedKey: z.string().min(1) });

/**
 * The agent has uploaded a STEP; the version joins the conversion queue.
 *
 * The original upload is left untouched. It is what the user sent, and a
 * re-translation later starts from it rather than from a derivative.
 */
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
    .set({
      status: 'queued',
      translatedKey: body.data.translatedKey,
      errorMessage: null,
      claimedAt: null,
    })
    // Guarded on the status the agent was given the job in, so a late reply
    // from a job that was already re-queued cannot resurrect itself.
    .where(
      and(eq(schema.modelVersions.id, id), eq(schema.modelVersions.status, 'translating')),
    )
    .returning();

  if (!version) return NextResponse.json({ error: 'not claimed' }, { status: 409 });

  return NextResponse.json({ version });
}
