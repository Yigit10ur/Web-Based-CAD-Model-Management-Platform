'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type Member = {
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
  email: string | null;
  name: string | null;
};

export type Invitation = {
  id: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
};

const ROLE_HELP: Record<Member['role'], string> = {
  owner: 'can add models and decide who else has access',
  editor: 'can add models',
  viewer: 'can look at models',
};

function Role({ role }: { role: Member['role'] }) {
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600" title={ROLE_HELP[role]}>
      {role}
    </span>
  );
}

export function MemberList({
  projectId,
  ownerId,
  members,
  invitations,
  canManage,
}: {
  projectId: string;
  ownerId: string;
  members: Member[];
  invitations: Invitation[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Member['role']>('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function call(input: RequestInit & { url: string }) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(input.url, input);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `failed (${response.status})`);
      router.refresh();
      return body;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;

    setNote(null);
    const result = await call({
      url: `/api/projects/${projectId}/members`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: address, role }),
    });

    if (!result) return;
    setEmail('');

    // An invitation is not a failure, but it is not access yet either, and
    // saying nothing would look like it had worked immediately.
    setNote(
      result.kind === 'invitation'
        ? `${address} has not signed in yet — they will get access the first time they do.`
        : null,
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between px-3 py-2">
            <span className="min-w-0 truncate text-sm text-slate-800">
              {member.name ?? member.email}
              {member.name && member.email && (
                <span className="pl-2 text-xs text-slate-400">{member.email}</span>
              )}
            </span>

            <span className="flex shrink-0 items-center gap-2">
              <Role role={member.role} />
              {canManage && member.userId !== ownerId && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    call({
                      url: `/api/projects/${projectId}/members?userId=${member.userId}`,
                      method: 'DELETE',
                    })
                  }
                  className="text-xs text-red-700 hover:underline disabled:text-slate-300"
                >
                  remove
                </button>
              )}
            </span>
          </li>
        ))}

        {invitations.map((invitation) => (
          <li
            key={invitation.id}
            className="flex items-center justify-between bg-slate-50 px-3 py-2"
          >
            <span className="min-w-0 truncate text-sm text-slate-500">
              {invitation.email}
              <span className="pl-2 text-xs text-slate-400">invited, not signed in yet</span>
            </span>

            <span className="flex shrink-0 items-center gap-2">
              <Role role={invitation.role} />
              {canManage && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    call({
                      url: `/api/projects/${projectId}/members?email=${encodeURIComponent(invitation.email)}`,
                      method: 'DELETE',
                    })
                  }
                  className="text-xs text-red-700 hover:underline disabled:text-slate-300"
                >
                  cancel
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {canManage && (
        <form onSubmit={add} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="colleague@example.com"
              className="w-64 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400"
            />

            <select
              value={role}
              onChange={(event) => setRole(event.target.value as Member['role'])}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            >
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
              <option value="owner">owner</option>
            </select>

            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
            >
              Add
            </button>
          </div>

          <p className="text-xs text-slate-500">{ROLE_HELP[role]}</p>
        </form>
      )}

      {note && <p className="text-xs text-slate-600">{note}</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
