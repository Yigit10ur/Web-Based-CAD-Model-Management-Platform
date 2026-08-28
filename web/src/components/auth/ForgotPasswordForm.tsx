'use client';

import { useState } from 'react';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);

    const response = await fetch('/api/password/forgot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const body = await response.json().catch(() => ({}));
    setSent(body.message ?? 'If that address has an account, a reset link is on its way.');
    setBusy(false);
  }

  // The same sentence whether or not there was an account to send to: the form
  // is public, and a different answer would be a way to ask who has one.
  if (sent) return <p className="text-sm text-slate-700">{sent}</p>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <input
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
        aria-label="Email"
      />

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
      >
        {busy ? 'Sending…' : 'Send a reset link'}
      </button>
    </form>
  );
}
