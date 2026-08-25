import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db, schema } from '@/db';
import { env } from '@/lib/env';
import { extensionOf, formatOf, rejectionReason } from '@/lib/formats';
import { getSession } from '@/lib/session';
import { presignUpload, storageKeys } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  filename: z.string().min(1),
  contentType: z.string().default('application/octet-stream'),
  sizeBytes: z.number().int().positive(),
});

export async function GET() {
  const session = await getSession();

  const rows = await db.query.models.findMany({
    where: eq(schema.models.projectId, session.projectId),
    orderBy: [desc(schema.models.createdAt)],
    with: {
      versions: {
        orderBy: [desc(schema.modelVersions.versionNo)],
      },
    },
  });

  return NextResponse.json({ models: rows });
}

/**
 * Create a model and hand back a presigned URL for its first version.
 *
 * The row is written before the file exists so the upload has a key to target.
 * It stays `uploading` until the client confirms, which keeps a half-finished
 * upload out of the converter's queue.
 */
export async function POST(request: Request) {
  const body = createSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues }, { status: 400 });
  }

  const { name, description, filename, contentType, sizeBytes } = body.data;

  const rejection = rejectionReason(filename);
  if (rejection) return NextResponse.json({ error: rejection }, { status: 415 });

  const limit = env().MAX_UPLOAD_MB * 1024 * 1024;
  if (sizeBytes > limit) {
    return NextResponse.json(
      { error: `File is larger than the ${env().MAX_UPLOAD_MB} MB limit.` },
      { status: 413 },
    );
  }

  const session = await getSession();

  const [model] = await db
    .insert(schema.models)
    .values({ projectId: session.projectId, name, description })
    .returning();

  const [version] = await db
    .insert(schema.modelVersions)
    .values({
      modelId: model.id,
      versionNo: 1,
      sourceKey: '',
      sourceFormat: formatOf(filename),
      sourceSizeBytes: sizeBytes,
      createdBy: session.userId,
    })
    .returning();

  const sourceKey = storageKeys.source(
    session.projectId,
    model.id,
    version.id,
    extensionOf(filename),
  );

  await db
    .update(schema.modelVersions)
    .set({ sourceKey })
    .where(eq(schema.modelVersions.id, version.id));

  await db
    .update(schema.models)
    .set({ currentVersionId: version.id })
    .where(eq(schema.models.id, model.id));

  return NextResponse.json(
    {
      model: { ...model, currentVersionId: version.id },
      version: { ...version, sourceKey },
      uploadUrl: await presignUpload(sourceKey, contentType),
    },
    { status: 201 },
  );
}
