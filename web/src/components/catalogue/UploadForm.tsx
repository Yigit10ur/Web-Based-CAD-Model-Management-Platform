'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { stageLabel, uploadCadFile, type UploadStage } from '@/lib/upload';

export function UploadForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<UploadStage>('idle');
  const [error, setError] = useState<string | null>(null);

  const busy = stage !== 'idle';

  async function upload(file: File) {
    setError(null);

    try {
      await uploadCadFile(file, {}, setStage);
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
          {stageLabel(stage, 'Upload model')}
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
