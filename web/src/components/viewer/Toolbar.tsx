'use client';

import { useViewerStore, type ViewerTool } from '@/store/viewer-store';

const TOOLS: { id: ViewerTool; label: string; hint: string }[] = [
  { id: 'select', label: 'Select', hint: 'Click a part to inspect it' },
  { id: 'measure', label: 'Measure', hint: 'Click two points; Esc cancels' },
];

export function Toolbar() {
  const tool = useViewerStore((state) => state.tool);
  const setTool = useViewerStore((state) => state.setTool);
  const active = TOOLS.find((entry) => entry.id === tool);

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

      <span className="rounded bg-white/80 px-2 py-1 text-[11px] text-slate-500">
        {active?.hint}
      </span>
    </div>
  );
}
