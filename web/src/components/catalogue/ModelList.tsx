'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import type { Model, ModelVersion } from '@/db/schema';

export type ModelWithVersions = Model & { versions: ModelVersion[] };

const STATUS_STYLE: Record<ModelVersion['status'], string> = {
  uploading: 'bg-slate-100 text-slate-600',
  queued: 'bg-amber-100 text-amber-800',
  processing: 'bg-blue-100 text-blue-800',
  ready: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
};

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

export function ModelList({ models }: { models: ModelWithVersions[] }) {
  const router = useRouter();

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
                {model.versions.length} version{model.versions.length === 1 ? '' : 's'}
                {latest && ` · ${latest.sourceFormat.toUpperCase()}`}
                {latest && ` · ${(latest.sourceSizeBytes / 1024 / 1024).toFixed(1)} MB`}
                {latest?.errorMessage && ` · ${latest.errorMessage}`}
              </p>
            </div>

            {latest && <Status version={latest} />}
          </li>
        );
      })}
    </ul>
  );
}
