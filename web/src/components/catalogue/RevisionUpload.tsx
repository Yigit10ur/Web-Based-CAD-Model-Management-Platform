'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { stageLabel, uploadCadFile, type UploadStage } from '@/lib/upload';

interface Props {
  modelId: string;
  /** True while any version of this model is still queued or converting. */
  converting: boolean;
}

/**
 * Adding a revision to a model that is already open.
 *
 * The previous version keeps its own files and stays selectable, so uploading
 * a revision never takes away what someone was looking at -- the version
 * switcher in the header is the other half of this.
 */
export function RevisionUpload({ modelId, converting }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<UploadStage>('idle');
  const [error, setError] = useState<string | null>(null);

  const busy = stage !== 'idle';

  // Conversion happens in another process, which has no way to tell the page
  // it finished. Poll only while something is actually in flight.
  useEffect(() => {
    if (!converting) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [converting, router]);

  async function upload(file: File) {
    setError(null);

    try {
      await uploadCadFile(file, { modelId }, setStage);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setStage('idle');
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-2">
      {converting && !busy && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
          converting…
        </span>
      )}

      {error && <span className="max-w-xs truncate text-[11px] text-red-700">{error}</span>}

      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
      >
        {stageLabel(stage, 'New revision')}
      </button>

      <input
        ref={input}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
