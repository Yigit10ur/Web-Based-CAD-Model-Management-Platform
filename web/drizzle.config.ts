import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs outside Next.js and would only read `.env`, while the
// application reads the whole `.env.local` cascade. Loading it the way Next
// does keeps the migration and the app pointed at the same database.
//
// Unless one was named explicitly. `db:migrate:prod` passes the production URL
// in the environment, and loading the cascade over the top of it would send a
// production migration to the development database without saying so.
if (!process.env.DATABASE_URL) loadEnvConfig(process.cwd());

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
