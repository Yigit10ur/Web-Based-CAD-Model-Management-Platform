import Link from 'next/link';
import { redirect } from 'next/navigation';

import { RegisterForm } from '@/components/auth/RegisterForm';
import { MINIMUM_LENGTH } from '@/lib/password';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  if (await currentUser()) redirect('/');

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-base font-medium text-slate-900">Create an account</h1>
        <p className="pt-1 pb-6 text-sm text-slate-500">
          Your models are yours: nobody else sees them until you share the project they
          are in.
        </p>

        <RegisterForm minimumLength={MINIMUM_LENGTH} />

        <p className="pt-4 text-center text-xs text-slate-500">
          Already have one?{' '}
          <Link href="/sign-in" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
