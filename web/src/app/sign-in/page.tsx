import Link from 'next/link';
import { redirect } from 'next/navigation';

import { githubEnabled, signIn } from '@/auth';
import { SignInForm } from '@/components/auth/SignInForm';
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
          <>
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

            <p className="py-4 text-center text-xs text-slate-400">or</p>
          </>
        )}

        <SignInForm />

        <p className="pt-3 text-center text-xs text-slate-500">
          <Link href="/forgot-password" className="text-slate-500 hover:underline">
            Forgotten your password?
          </Link>
        </p>

        <p className="pt-2 text-center text-xs text-slate-500">
          No account yet?{' '}
          <Link href="/register" className="text-blue-600 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
