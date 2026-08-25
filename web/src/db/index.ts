import { PgDatabase } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '@/lib/env';

import * as schema from './schema';

type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * One connection pool per process, opened on first use.
 *
 * Two reasons it is lazy rather than created at import. Next.js evaluates
 * every route module while building, so touching the environment here would
 * make the build fail on a machine that has no database configured -- CI
 * included. And a page that wants to catch "not configured" and explain it can
 * only do so if the error is thrown by the query rather than by the import.
 *
 * The pool is stashed on globalThis because Next.js re-evaluates modules on
 * every edit in development, which would otherwise open a new pool each time
 * until the database refused connections.
 */
const cache = globalThis as unknown as { sql?: ReturnType<typeof postgres>; db?: Database };

function instance(): Database {
  if (cache.db) return cache.db;

  const sql =
    cache.sql ??
    postgres(env().DATABASE_URL, {
      max: 10,
      // Supabase's transaction pooler does not support prepared statements.
      prepare: false,
    });

  const database = drizzle(sql, { schema });

  if (process.env.NODE_ENV !== 'production') {
    cache.sql = sql;
    cache.db = database;
  }

  return database;
}

/**
 * The database handle.
 *
 * A proxy so that call sites read as `db.query.models.findMany(...)` while the
 * connection is still only opened when one of them actually runs.
 */
/**
 * The proxy target inherits from PgDatabase rather than from Object.
 *
 * Drizzle identifies a dialect by walking the prototype chain, and libraries
 * built on it do the same -- the Auth.js adapter refuses a database it cannot
 * classify, and it asks the moment `auth.ts` is imported. Answering that from
 * a real connection would drag the environment back into module load and fail
 * every build without a database. Borrowing the prototype answers the question
 * truthfully without opening anything.
 */
const target = Object.create(PgDatabase.prototype) as Database;

export const db = new Proxy(target, {
  get(_target, property) {
    const database = instance();
    const value = Reflect.get(database, property, database);
    return typeof value === 'function' ? value.bind(database) : value;
  },
});

export { schema };
