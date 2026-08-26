/**
 * Report what is actually in a database.
 *
 * Written as a script rather than a command to paste because the interesting
 * moment to run it is against production, and a long command with a password
 * in the middle of it is exactly the thing to get wrong once.
 *
 *   npm run db:check          the development database (.env.local)
 *   npm run db:check:prod     the production one (.env.prod)
 */

import postgres from 'postgres';

const url = process.env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL is not set. See .env.example or .env.prod.example.');
  process.exit(1);
}

// Never print the URL: it carries the password.
const host = url.includes('@') ? url.split('@')[1].split('/')[0] : '(unparsed)';
console.log(`host: ${host}\n`);

const sql = postgres(url, { prepare: false, max: 1 });

const EXPECTED_TABLES = [
  'accounts',
  'model_versions',
  'models',
  'project_members',
  'projects',
  'sessions',
  'users',
  'verification_tokens',
];

try {
  const tables = (
    await sql`
      select table_name from information_schema.tables
      where table_schema = 'public' order by table_name`
  ).map((row) => row.table_name);

  for (const table of EXPECTED_TABLES) {
    console.log(`  ${tables.includes(table) ? '✓' : '✗ MISSING'}  ${table}`);
  }

  const extra = tables.filter((table) => !EXPECTED_TABLES.includes(table));
  if (extra.length > 0) console.log(`  (also present: ${extra.join(', ')})`);

  const statuses = (
    await sql`select unnest(enum_range(null::conversion_status))::text as value`
  ).map((row) => row.value);
  console.log(`\nconversion_status: ${statuses.join(', ')}`);

  const [{ count }] = await sql`
    select count(*)::int as count from drizzle.__drizzle_migrations`;
  console.log(`migrations applied: ${count}`);

  const missing = EXPECTED_TABLES.filter((table) => !tables.includes(table));
  console.log(
    missing.length === 0
      ? '\nSchema is complete.'
      : `\nSchema is incomplete: ${missing.length} table(s) missing. Run db:migrate.`,
  );
  process.exitCode = missing.length === 0 ? 0 : 1;
} catch (cause) {
  console.error(`\nCould not read the database: ${cause.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
