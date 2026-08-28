'use client';

import { useState } from 'react';

export function VerifyBanner({ email }: { email: string | null }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');

  async function resend() {
    setState('sending');
    await fetch('/api/verify-email/resend', { method: 'POST' });
    setState('sent');
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <span>
        {email ? <strong className="font-medium">{email}</strong> : 'Your address'} is not
        confirmed yet. Projects shared with it stay closed until it is.
      </span>

      {state === 'sent' ? (
        <span className="text-amber-700">Sent — check your inbox.</span>
      ) : (
        <button
          type="button"
          disabled={state === 'sending'}
          onClick={resend}
          className="font-medium text-amber-900 underline hover:no-underline disabled:no-underline disabled:opacity-50"
        >
          {state === 'sending' ? 'Sending…' : 'Send the link again'}
        </button>
      )}
    </div>
  );
}
