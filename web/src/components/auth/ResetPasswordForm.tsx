'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ResetPasswordForm({
  token,
  minimumLength,
}: {
  token: string;
  minimumLength: number;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/password/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Could not set that password.');

      // Straight in with the password just chosen, rather than sending someone
      // who has just proved who they are back to a sign-in form.
      const result = await signIn('password', {
        email: body.email,
        password,
        redirect: false,
      });
      if (result?.error) throw new Error('Password changed. Please sign in.');

      router.push('/');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <input
        type="password"
        autoComplete="new-password"
        required
        minLength={minimumLength}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="New password"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
        aria-label="New password"
      />

      <p className="text-xs text-slate-500">At least {minimumLength} characters.</p>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
      >
        {busy ? 'Saving…' : 'Set password'}
      </button>

      {error && <p className="text-xs text-red-700">{error}</p>}
    </form>
  );
}
