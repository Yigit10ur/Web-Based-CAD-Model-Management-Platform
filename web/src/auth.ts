import { DrizzleAdapter } from '@auth/drizzle-adapter';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';

import { db, schema } from '@/db';
import { authenticate } from '@/lib/accounts';
import { claimInvitations } from '@/lib/projects';

/**
 * Authentication.
 *
 * GitHub is the only real provider: this is a tool for people who already have
 * a GitHub account, and not owning a password store is a feature.
 *
 * The second is email and password, for people who do not have a GitHub
 * account or do not want to use it here. Everything that makes a password
 * usable safely -- how it is hashed, what is refused, how guessing is slowed
 * down -- is in `lib/password.ts` and `lib/accounts.ts`; this file only wires
 * them in.
 */

const providers = [
  ...(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
    ? [
        GitHub({
          clientId: process.env.AUTH_GITHUB_ID,
          clientSecret: process.env.AUTH_GITHUB_SECRET,
        }),
      ]
    : []),

  Credentials({
    id: 'password',
    name: 'Email and password',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      return authenticate(String(credentials?.email ?? ''), String(credentials?.password ?? ''));
    },
  }),
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
  events: {
    /**
     * Someone can be invited to a project before they have an account, so this
     * is the first moment those invitations have a user to attach themselves
     * to. A failure here must not stop the sign-in: the invitation is still in
     * the table and the next sign-in will find it.
     */
    async signIn({ user }) {
      if (!user.id || !user.email) return;

      try {
        await claimInvitations(user.id, user.email);
      } catch (error) {
        console.error('could not claim invitations', error);
      }
    },
  },
});

/** Whether GitHub sign-in is configured; the sign-in page adapts to it. */
export const githubEnabled = Boolean(
  process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET,
);
/** Whether the sign-in page offers email and password. Always: it needs no setup. */
export const passwordSignInEnabled = true;
