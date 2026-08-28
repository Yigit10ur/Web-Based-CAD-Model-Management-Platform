import Link from 'next/link';

import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { MINIMUM_LENGTH } from '@/lib/password';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-base font-medium text-slate-900">Choose a new password</h1>

        {token ? (
          <>
            <p className="pt-1 pb-6 text-sm text-slate-500">
              This link works once. You will be signed in afterwards.
            </p>
            <ResetPasswordForm token={token} minimumLength={MINIMUM_LENGTH} />
          </>
        ) : (
          <p className="pt-1 pb-6 text-sm text-slate-500">
            That link is missing its token.{' '}
            <Link href="/forgot-password" className="text-blue-600 hover:underline">
              Ask for a new one
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  );
}
