/**
 * A real Postgres for tests, running in this process.
 *
 * The access rules being tested are expressed as SQL -- joins across
 * memberships, a visibility column, uuid comparisons. Asserting them against a
 * mocked query builder would test the mock. PGlite is Postgres compiled to
 * WebAssembly, so the same statements run against the same engine, with no
 * container and no credentials for CI to hold.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '@/db/schema';

export type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  // The same migrations the real database runs, so a schema change that breaks
  // them breaks the tests too.
  await migrate(db, { migrationsFolder: './drizzle' });

  return db;
}
