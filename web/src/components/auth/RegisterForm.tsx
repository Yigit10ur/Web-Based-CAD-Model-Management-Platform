'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RegisterForm({ minimumLength }: { minimumLength: number }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Could not create the account.');

      // Straight in, with the password just chosen.
      const result = await signIn('password', { email, password, redirect: false });
      if (result?.error) throw new Error('Account created, but signing in failed.');

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
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        aria-label="Email"
      />

      <input
        type="text"
        autoComplete="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name (optional)"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        aria-label="Name"
      />

      <input
        type="password"
        autoComplete="new-password"
        required
        minLength={minimumLength}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Password"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        aria-label="Password"
      />

      <p className="text-xs text-slate-500">
        At least {minimumLength} characters. Length is what makes a password hard to
        guess, so a phrase you can remember beats a short one you cannot.
      </p>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
      >
        {busy ? 'Creating…' : 'Create account'}
      </button>

      {error && <p className="text-xs text-red-700">{error}</p>}
    </form>
  );
}
