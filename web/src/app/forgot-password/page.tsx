import Link from 'next/link';

import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-base font-medium text-slate-900">Reset your password</h1>
        <p className="pt-1 pb-6 text-sm text-slate-500">
          We will send a link that lets you choose a new one.
        </p>

        <ForgotPasswordForm />

        <p className="pt-4 text-center text-xs text-slate-500">
          <Link href="/sign-in" className="text-blue-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
