import { NextResponse } from 'next/server';

import { agentAuthorised, claimTranslationJob, translatedKeyFor } from '@/lib/agent';
import { presignDownload, presignUpload } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** Hand one waiting file to the agent, with everything it needs to do the work. */
export async function POST(request: Request) {
  if (!agentAuthorised(request)) {
    return NextResponse.json({ error: 'not authorised' }, { status: 401 });
  }

  const job = await claimTranslationJob();

  // Nothing waiting is the normal case, not an error; the agent polls.
  if (!job) return NextResponse.json({ job: null });

  const translatedKey = translatedKeyFor(job.source_key);

  return NextResponse.json({
    job: {
      versionId: job.id,
      filename: job.source_key.split('/').pop(),
      // Both URLs are issued here so the agent needs no further calls and no
      // storage credentials of its own.
      downloadUrl: await presignDownload(job.source_key),
      uploadUrl: await presignUpload(translatedKey, 'application/step'),
      translatedKey,
    },
  });
}
