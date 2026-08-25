'use client';

import { useEffect } from 'react';

import { useModelMetadata } from '@/lib/metadata';
import { useViewerStore } from '@/store/viewer-store';

import { AssemblyTree } from './AssemblyTree';
import { PropertiesPanel } from './PropertiesPanel';
import { Toolbar } from './Toolbar';
import { Viewer } from './Viewer';

interface Props {
  /** Presigned URL for the converted .glb, or a path under /public. */
  modelUrl: string;
  /** Presigned URL for the matching metadata.json. */
  metadataUrl: string;
}

export function ModelWorkspace({ modelUrl, metadataUrl }: Props) {
  const { metadata, error } = useModelMetadata(metadataUrl);

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
        <Toolbar source={metadata.geometry_source} />
        <Viewer url={modelUrl} metadata={metadata} />
      </div>
      <PropertiesPanel metadata={metadata} />
    </div>
  );
}
