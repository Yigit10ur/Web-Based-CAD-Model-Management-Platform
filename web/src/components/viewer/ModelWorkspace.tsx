'use client';

import { useEffect } from 'react';

import { useModelMetadata } from '@/lib/metadata';
import { useViewerStore } from '@/store/viewer-store';

import { AssemblyTree } from './AssemblyTree';
import { PropertiesPanel } from './PropertiesPanel';
import { Toolbar } from './Toolbar';
import { Viewer } from './Viewer';

/**
 * Development sample, produced by the converter:
 *
 *   python -m app.cli convert tests/fixtures/assembly.step \
 *       ../web/public/samples/assembly.glb
 *
 * Replaced by presigned URLs from the API once model storage exists.
 */
const MODEL_URL = '/samples/assembly.glb';
const METADATA_URL = '/samples/assembly.json';

export function ModelWorkspace() {
  const { metadata, error } = useModelMetadata(METADATA_URL);

  // Escape abandons a measurement in progress, then leaves the tool. Two
  // presses rather than one so a mis-click does not also cost the tool.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      const { pending, cancelPending, tool, setTool } = useViewerStore.getState();
      if (pending) {
        cancelPending();
      } else if (tool !== 'select') {
        setTool('select');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-red-700">Could not load model metadata: {error}</p>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-slate-400">Loading model…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <AssemblyTree metadata={metadata} />
      <div className="relative min-w-0 flex-1">
        <Toolbar />
        <Viewer url={MODEL_URL} metadata={metadata} />
      </div>
      <PropertiesPanel metadata={metadata} />
    </div>
  );
}
