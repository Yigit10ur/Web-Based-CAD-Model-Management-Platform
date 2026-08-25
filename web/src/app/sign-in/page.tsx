import { redirect } from 'next/navigation';

import { devSignInEnabled, githubEnabled, signIn } from '@/auth';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  if (await currentUser()) redirect('/');

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-base font-medium text-slate-900">CAD Models</h1>
        <p className="pt-1 pb-6 text-sm text-slate-500">
          Sign in to upload and inspect models.
        </p>

        {githubEnabled && (
          <form
            action={async () => {
              'use server';
              await signIn('github', { redirectTo: '/' });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Continue with GitHub
            </button>
          </form>
        )}

        {devSignInEnabled && (
          <form
            action={async (formData: FormData) => {
              'use server';
              await signIn('dev', {
                email: formData.get('email'),
                redirectTo: '/',
              });
            }}
            className="pt-4"
          >
            {githubEnabled && (
              <p className="pb-3 text-center text-xs text-slate-400">or, on this machine</p>
            )}

            <input
              name="email"
              type="email"
              required
              defaultValue="dev@localhost"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              aria-label="Email"
            />
            <button
              type="submit"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Development sign-in
            </button>
            {/* Only rendered off a development build; there is no password
                here and there must never be one in production. */}
            <p className="pt-2 text-center text-[11px] text-slate-400">
              Development only — no password, not available in production.
            </p>
          </form>
        )}

        {!githubEnabled && !devSignInEnabled && (
          <p className="text-sm text-red-700">
            No sign-in provider is configured. Set AUTH_GITHUB_ID and
            AUTH_GITHUB_SECRET.
          </p>
        )}
      </div>
    </main>
  );
}
