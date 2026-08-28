import Link from 'next/link';

import { verifyEmail } from '@/lib/verification';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { token } = await searchParams;
  const result = token ? await verifyEmail(token) : { ok: false as const };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm text-center">
        {result.ok ? (
          <>
            <h1 className="text-base font-medium text-slate-900">Address confirmed</h1>
            <p className="pt-2 text-sm text-slate-600">
              {result.claimed > 0
                ? `${result.email} is confirmed, and ${result.claimed === 1 ? 'a project that was' : `${result.claimed} projects that were`} shared with it ${result.claimed === 1 ? 'is' : 'are'} now open to you.`
                : `${result.email} is confirmed.`}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-base font-medium text-slate-900">That link did not work</h1>
            <p className="pt-2 text-sm text-slate-600">
              It has expired or has already been used. Sign in and ask for another.
            </p>
          </>
        )}

        <p className="pt-6 text-xs text-slate-500">
          <Link href="/" className="text-blue-600 hover:underline">
            Go to your models
          </Link>
        </p>
      </div>
    </main>
  );
}
