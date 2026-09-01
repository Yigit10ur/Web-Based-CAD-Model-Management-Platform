'use client';

import { useSyncExternalStore } from 'react';

import type { GeometrySource } from '@/lib/metadata';
import { keyLabelsFor } from '@/lib/navigation';
import { useViewerStore, type ViewerTool } from '@/store/viewer-store';

const TOOLS: { id: ViewerTool; label: string; hint: string }[] = [
  { id: 'select', label: 'Select', hint: 'Click a part to inspect it' },
  { id: 'measure', label: 'Measure', hint: 'Click two points; Esc cancels' },
];

export function Toolbar({ source }: { source: GeometrySource }) {
  const tool = useViewerStore((state) => state.tool);
  const setTool = useViewerStore((state) => state.setTool);
  const picking = useViewerStore((state) => state.section.picking);
  const active = TOOLS.find((entry) => entry.id === tool);

  /*
   * Named after the keyboard in front of the person, not after the one the
   * layout was copied from.
   *
   * The server has no keyboard to look at, so it renders the neutral names and
   * the browser replaces them -- which is what the third argument is for. The
   * value never changes afterwards, so nothing subscribes to it.
   */
  const platform = useSyncExternalStore(
    () => () => {},
    () => navigator.userAgent,
    () => '',
  );
  const keys = keyLabelsFor(platform);

  return (
    <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2">
      <div className="pointer-events-auto flex overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
        {TOOLS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`px-3 py-1.5 text-xs font-medium ${
              entry.id === tool
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => setTool(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {/* The left button no longer moves the camera, which is right for a CAD
          package and is not guessable. Someone who does not know reaches for
          the left button, nothing turns, and concludes the viewer is broken --
          so the layout is on screen rather than in a document. */}
      <span className="hidden rounded bg-white/80 px-2 py-1 font-mono text-[11px] text-slate-500 lg:inline">
        middle drag rotate · {keys.pan} pan · {keys.zoom} zoom · {keys.roll} roll · f fit
      </span>

      {picking ? (
        <span className="rounded bg-amber-500 px-2 py-1 text-[11px] font-medium text-white">
          Click a flat face to cut along it · Esc cancels
        </span>
      ) : (
        <span className="rounded bg-white/80 px-2 py-1 text-[11px] text-slate-500">
          {active?.hint}
        </span>
      )}

      {/* A mesh has nothing exact to snap to, so measurements land wherever
          the cursor did. Saying so up front beats letting someone read a
          dimension off it and trust it. */}
      {source === 'mesh' && tool === 'measure' && (
        <span className="rounded bg-amber-100 px-2 py-1 text-[11px] text-amber-800">
          Mesh source — no snapping, measurements are approximate
        </span>
      )}
    </div>
  );
}
