import { DrizzleAdapter } from '@auth/drizzle-adapter';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';

import { db, schema } from '@/db';

/**
 * Authentication.
 *
 * GitHub is the only real provider: this is a tool for people who already have
 * a GitHub account, and not owning a password store is a feature.
 *
 * The second provider is a development shortcut. Registering an OAuth app is a
 * few minutes of clicking that should not stand between a fresh clone and a
 * running application, so on a development machine you can sign in as a local
 * user with no external service at all. It is gated on NODE_ENV and refuses to
 * load in production, where the sign-in page shows GitHub alone.
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

const providers = [
  ...(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
    ? [
        GitHub({
          clientId: process.env.AUTH_GITHUB_ID,
          clientSecret: process.env.AUTH_GITHUB_SECRET,
        }),
      ]
    : []),

  ...(isDevelopment
    ? [
        Credentials({
          id: 'dev',
          name: 'Development sign-in',
          credentials: { email: { label: 'Email', type: 'email' } },
          async authorize(credentials) {
            const email = String(credentials?.email ?? '').trim().toLowerCase();
            if (!email) return null;

            const [user] = await db
              .insert(schema.users)
              .values({ email, name: email.split('@')[0] })
              .onConflictDoUpdate({
                target: schema.users.email,
                set: { email },
              })
              .returning();

            return { id: user.id, email: user.email, name: user.name };
          },
        }),
      ]
    : []),
];

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  providers,
  // The credentials provider cannot use database sessions, so both strategies
  // would otherwise be in play at once. JWT keeps one code path.
  session: { strategy: 'jwt' },
  pages: { signIn: '/sign-in' },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

/** Whether GitHub sign-in is configured; the sign-in page adapts to it. */
export const githubEnabled = Boolean(
  process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET,
);
export const devSignInEnabled = isDevelopment;
