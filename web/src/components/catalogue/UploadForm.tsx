'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { rejectionReason } from '@/lib/formats';

type Stage = 'idle' | 'creating' | 'uploading' | 'queueing';

/**
 * Three step upload.
 *
 * The file goes straight from the browser to object storage with a presigned
 * PUT; the application only ever handles the small JSON around it. The version
 * is not queued until the PUT has finished, so the converter is never handed a
 * partial file.
 */
export function UploadForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);

  const busy = stage !== 'idle';

  async function upload(file: File) {
    setError(null);

    const rejection = rejectionReason(file.name);
    if (rejection) {
      setError(rejection);
      return;
    }

    try {
      setStage('creating');
      const created = await fetch('/api/models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: file.name.replace(/\.[^.]+$/, ''),
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }),
      });

      const payload = await created.json();
      if (!created.ok) throw new Error(payload.error ?? 'could not create the model');

      setStage('uploading');
      const put = await fetch(payload.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!put.ok) throw new Error(`upload failed with ${put.status}`);

      setStage('queueing');
      await fetch(`/api/versions/${payload.version.id}/uploaded`, { method: 'POST' });

      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setStage('idle');
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
        >
          {stage === 'idle' && 'Upload model'}
          {stage === 'creating' && 'Preparing…'}
          {stage === 'uploading' && 'Uploading…'}
          {stage === 'queueing' && 'Queueing…'}
        </button>

        <span className="text-xs text-slate-500">STEP, IGES, STL, OBJ, PLY, glTF</span>
      </div>

      <input
        ref={input}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
