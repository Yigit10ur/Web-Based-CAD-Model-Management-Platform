'use client';

import { useMemo } from 'react';

import type { ModelMetadata } from '@/lib/metadata';
import { modelBounds, type SectionAxis } from '@/lib/section';
import { useViewerStore } from '@/store/viewer-store';

const AXES: SectionAxis[] = ['x', 'y', 'z'];
const AXIS_INDEX: Record<SectionAxis, number> = { x: 0, y: 1, z: 2 };

export function SectionControls({ metadata }: { metadata: ModelMetadata }) {
  const section = useViewerStore((state) => state.section);
  const setSection = useViewerStore((state) => state.setSection);

  const bounds = useMemo(() => modelBounds(metadata.parts), [metadata]);
  const index = AXIS_INDEX[section.axis];
  // The slider is normalised across the model; the readout is in millimetres,
  // because that is the number someone reading a section actually wants.
  const at =
    bounds[0][index] + (bounds[1][index] - bounds[0][index]) * section.position;

  return (
    <div className="border-t border-slate-200 px-3 py-3">
      <div className="flex items-center justify-between pb-2">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={section.enabled}
            onChange={(event) => setSection({ enabled: event.target.checked })}
            className="accent-blue-600"
          />
          Section
        </label>

        {section.enabled && (
          <span className="font-mono text-xs text-slate-900 tabular-nums">
            {section.axis.toUpperCase()} = {at.toFixed(2)} mm
          </span>
        )}
      </div>

      {section.enabled && (
        <>
          <div className="flex items-center gap-1 pb-2">
            <div className="flex overflow-hidden rounded border border-slate-300">
              {AXES.map((axis) => (
                <button
                  key={axis}
                  type="button"
                  className={`px-2.5 py-1 text-xs font-medium ${
                    axis === section.axis
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  onClick={() => setSection({ axis })}
                >
                  {axis.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
              onClick={() => setSection({ flipped: !section.flipped })}
              title="Keep the other half"
            >
              flip
            </button>
          </div>

          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={section.position}
            onChange={(event) => setSection({ position: Number(event.target.value) })}
            className="w-full accent-blue-600"
            aria-label="Section position"
          />
        </>
      )}
    </div>
  );
}
