'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { Model, ModelVersion } from '@/db/schema';

export type ModelWithVersions = Model & { versions: ModelVersion[] };

const STATUS_STYLE: Record<ModelVersion['status'], string> = {
  uploading: 'bg-slate-100 text-slate-600',
  queued: 'bg-amber-100 text-amber-800',
  processing: 'bg-blue-100 text-blue-800',
  ready: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
};

/** Kilobytes below a megabyte: a 39 KB fixture reading "0.0 MB" is useless. */
function formatSize(bytes: number): string {
  const megabytes = bytes / 1024 / 1024;
  return megabytes < 1 ? `${Math.round(bytes / 1024)} KB` : `${megabytes.toFixed(1)} MB`;
}

function Status({ version }: { version: ModelVersion }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[version.status]}`}
      title={version.errorMessage ?? undefined}
    >
      {version.status}
    </span>
  );
}

export function ModelList({
  models,
  projects = [],
  deletable = [],
}: {
  models: ModelWithVersions[];
  /** Empty when there is only one project: the label would say nothing. */
  projects?: { id: string; name: string }[];
  /**
   * Ids the signed-in user may delete, decided by the same rule the API
   * applies. Anything not in here simply has no button, rather than a button
   * that fails.
   */
  deletable?: string[];
}) {
  const router = useRouter();
  const projectName = new Map(projects.map((project) => [project.id, project.name]));
  const canDelete = new Set(deletable);

  // Which row is asking to be confirmed, and which is being deleted. One at a
  // time: two half-confirmed deletions on screen is how the wrong one gets
  // pressed.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    setBusy(id);
    setError(null);

    try {
      const response = await fetch(`/api/models/${id}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `failed (${response.status})`);
      setConfirming(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  // Conversion happens in another process, so the page has no way of being
  // told when it finishes. Poll only while something is actually in flight.
  const pending = models.some((model) =>
    model.versions.some((version) => version.status === 'queued' || version.status === 'processing'),
  );

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [pending, router]);

  if (models.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-slate-400">
        No models yet. Upload a STEP file, or open the{' '}
        <Link href="/sample" className="text-blue-600 hover:underline">
          bundled sample
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-200">
      {models.map((model) => {
        const latest = model.versions[0];
        const openable = latest?.status === 'ready';

        return (
          <li key={model.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              {openable ? (
                <Link
                  href={`/models/${model.id}`}
                  className="text-sm font-medium text-slate-900 hover:text-blue-700 hover:underline"
                >
                  {model.name}
                </Link>
              ) : (
                <span className="text-sm font-medium text-slate-500">{model.name}</span>
              )}

              <p className="truncate text-xs text-slate-400">
                {projectName.has(model.projectId) && (
                  <span className="text-slate-500">
                    {projectName.get(model.projectId)} ·{' '}
                  </span>
                )}
                {model.versions.length} version{model.versions.length === 1 ? '' : 's'}
                {latest && ` · ${latest.sourceFormat.toUpperCase()}`}
                {latest && ` · ${formatSize(latest.sourceSizeBytes)}`}
                {latest?.errorMessage && ` · ${latest.errorMessage}`}
              </p>
            </div>

            {latest && <Status version={latest} />}

            {canDelete.has(model.id) &&
              (confirming === model.id ? (
                <span className="flex shrink-0 items-center gap-2">
                  {/* The count is the part worth reading twice: deleting a
                      model takes its revisions with it. */}
                  <span className="text-xs text-slate-500">
                    delete all {model.versions.length} version
                    {model.versions.length === 1 ? '' : 's'}?
                  </span>
                  <button
                    type="button"
                    disabled={busy === model.id}
                    onClick={() => remove(model.id)}
                    className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:bg-slate-300"
                  >
                    {busy === model.id ? 'deleting…' : 'delete'}
                  </button>
                  <button
                    type="button"
                    disabled={busy === model.id}
                    onClick={() => setConfirming(null)}
                    className="text-xs text-slate-500 hover:underline"
                  >
                    cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setConfirming(model.id);
                  }}
                  className="shrink-0 text-xs text-slate-400 hover:text-red-700 hover:underline"
                >
                  delete
                </button>
              ))}
          </li>
        );
      })}

      {error && <li className="py-2 text-xs text-red-700">{error}</li>}
    </ul>
  );
}
