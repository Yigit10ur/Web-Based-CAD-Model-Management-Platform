/**
 * The translation agent's side of the fence.
 *
 * Native Inventor files can only be read by Inventor. The agent is a small
 * service running on a machine that has it installed, usually inside the
 * company network, and it reaches this deployment over HTTP like any other
 * client. It never touches the database or the storage credentials: it claims
 * work, gets two presigned URLs, and reports back.
 *
 * That boundary is the point. The machine with the CAD licence is the least
 * likely place to want database credentials sitting in a config file.
 */

import { timingSafeEqual } from 'node:crypto';

import { sql, type SQL } from 'drizzle-orm';

import { db as defaultDb } from '@/db';

import { env } from './env';

export function agentAuthorised(request: Request): boolean {
  const configured = env().AGENT_TOKEN;
  if (!configured) return false;

  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (presented.length !== configured.length) return false;

  // Comparing with === leaks the length of the matching prefix through timing.
  return timingSafeEqual(Buffer.from(presented), Buffer.from(configured));
}

export interface TranslationJob {
  id: string;
  source_key: string;
}

/**
 * Take one waiting file off the queue.
 *
 * Claiming and marking in one statement so two agents cannot take the same
 * job: the subquery locks the row, and SKIP LOCKED sends a second agent to the
 * next one rather than making it wait behind the first. The Python worker
 * claims its own queue the same way.
 *
 * The database is a parameter so the test suite can run this against its own
 * instance rather than the deployment's. It is typed by the one method used
 * rather than by the driver, because the two are different classes and the
 * point of passing it in is that either will do.
 */
interface Executor {
  execute: (query: SQL) => Promise<unknown>;
}

export async function claimTranslationJob(
  database: Executor = defaultDb,
): Promise<TranslationJob | null> {
  const claimed = await database.execute(sql`
    update model_versions
    set status = 'translating', claimed_at = now()
    where id = (
      select id from model_versions
      where status = 'awaiting_translation'
      order by created_at
      for update skip locked
      limit 1
    )
    returning id, source_key
  `);

  // Drivers disagree about the shape of a raw result: postgres-js returns the
  // rows as an array, PGlite wraps them in `{ rows }`. Normalising here is
  // what lets the test suite exercise the real statement rather than a
  // paraphrase of it.
  const rows: TranslationJob[] = Array.isArray(claimed)
    ? (claimed as TranslationJob[])
    : ((claimed as { rows?: TranslationJob[] }).rows ?? []);

  return rows[0] ?? null;
}

/** Where the agent uploads the STEP it produced, beside the file it read. */
export function translatedKeyFor(sourceKey: string): string {
  return `${sourceKey.replace(/\/[^/]+$/, '')}/translated.step`;
}
