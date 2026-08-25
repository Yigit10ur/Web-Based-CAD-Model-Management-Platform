import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db, schema } from '@/db';
import { env } from '@/lib/env';
import { extensionOf, formatOf, rejectionReason } from '@/lib/formats';
import { getSession } from '@/lib/session';
import { presignUpload, storageKeys } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().default('application/octet-stream'),
  sizeBytes: z.number().int().positive(),
});

/** Add a revision. The previous version keeps its own files and stays viewable. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = bodySchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues }, { status: 400 });
  }

  const { filename, contentType, sizeBytes } = body.data;

  const rejection = rejectionReason(filename);
  if (rejection) return NextResponse.json({ error: rejection }, { status: 415 });

  if (sizeBytes > env().MAX_UPLOAD_MB * 1024 * 1024) {
    return NextResponse.json(
      { error: `File is larger than the ${env().MAX_UPLOAD_MB} MB limit.` },
      { status: 413 },
    );
  }

  const model = await db.query.models.findFirst({ where: eq(schema.models.id, id) });
  if (!model) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const session = await getSession();

  const [latest] = await db
    .select({ versionNo: schema.modelVersions.versionNo })
    .from(schema.modelVersions)
    .where(eq(schema.modelVersions.modelId, model.id))
    .orderBy(desc(schema.modelVersions.versionNo))
    .limit(1);

  const [version] = await db
    .insert(schema.modelVersions)
    .values({
      modelId: model.id,
      versionNo: (latest?.versionNo ?? 0) + 1,
      sourceKey: '',
      sourceFormat: formatOf(filename),
      sourceSizeBytes: sizeBytes,
      createdBy: session.userId,
    })
    .returning();

  const sourceKey = storageKeys.source(
    model.projectId,
    model.id,
    version.id,
    extensionOf(filename),
  );

  await db
    .update(schema.modelVersions)
    .set({ sourceKey })
    .where(eq(schema.modelVersions.id, version.id));

  return NextResponse.json(
    {
      version: { ...version, sourceKey },
      uploadUrl: await presignUpload(sourceKey, contentType),
    },
    { status: 201 },
  );
}
