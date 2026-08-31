import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';

export const dynamic = 'force-dynamic';

/**
 * Is this instance able to serve?
 *
 * For whatever is watching the process -- a load balancer, a monitor, an
 * engineer with curl. Deliberately not authenticated: something has to be able
 * to ask before anyone can sign in, and the answer carries nothing an attacker
 * does not learn by loading the home page.
 *
 * The database is checked because a web process that cannot reach it can still
 * accept connections and fail every request, which is the failure worth taking
 * out of rotation. Storage is not checked: it is reached by the browser
 * directly through presigned URLs, so an instance that cannot see it still
 * serves every page, and putting it here would take the whole site down for a
 * fault that stops uploads alone.
 */
export async function GET() {
  const started = Date.now();

  try {
    await db.execute(sql`select 1`);
  } catch (cause) {
    // The reason stays in the log; the response says only that it is down.
    // A connection string in an unauthenticated response is a leak.
    console.error('[health] database unreachable', cause);
    return NextResponse.json(
      { status: 'down', database: false },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  return NextResponse.json(
    { status: 'ok', database: true, ms: Date.now() - started },
    { headers: { 'cache-control': 'no-store' } },
  );
}
