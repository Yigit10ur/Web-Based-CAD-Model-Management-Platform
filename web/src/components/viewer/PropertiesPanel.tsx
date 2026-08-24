'use client';

import type { ModelMetadata } from '@/lib/metadata';
import { useViewerStore } from '@/store/viewer-store';

import { SectionControls } from './SectionControls';

function format(value: number, digits = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-mono text-xs text-slate-900 tabular-nums">{value}</dd>
    </div>
  );
}

export function PropertiesPanel({ metadata }: { metadata: ModelMetadata }) {
  const selected = useViewerStore((state) => state.selected);
  const selectedFace = useViewerStore((state) => state.selectedFace);
  const explode = useViewerStore((state) => state.explode);
  const setExplode = useViewerStore((state) => state.setExplode);
  const tool = useViewerStore((state) => state.tool);
  const measurements = useViewerStore((state) => state.measurements);
  const removeMeasurement = useViewerStore((state) => state.removeMeasurement);
  const clearMeasurements = useViewerStore((state) => state.clearMeasurements);
  const measuring = tool === 'measure';

  const part = selected ? metadata.parts[selected] : null;
  const faceCount = selected ? (metadata.face_groups[selected]?.length ?? 0) : 0;

  const name = (() => {
    let found: string | null = null;
    const walk = (nodes: typeof metadata.tree) => {
      for (const node of nodes) {
        if (node.id === selected) found = node.name;
        walk(node.children);
      }
    };
    walk(metadata.tree);
    return found;
  })();

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2">
        <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Properties</h2>
      </div>

      {measurements.length > 0 && (
        <div className="border-b border-slate-200 px-3 py-2">
          <div className="flex items-center justify-between pb-1">
            <h3 className="text-xs font-semibold text-slate-500">
              Measurements ({measurements.length})
            </h3>
            <button
              type="button"
              className="text-xs text-blue-600 hover:underline"
              onClick={clearMeasurements}
            >
              clear
            </button>
          </div>

          <ul className="space-y-1">
            {measurements.map((measurement) => (
              <li key={measurement.id} className="group flex items-baseline gap-2">
                <span className="font-mono text-xs text-slate-900 tabular-nums">
                  {format(measurement.distance)} mm
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">
                  {measurement.fromLabel} → {measurement.toLabel}
                </span>
                <button
                  type="button"
                  className="text-xs text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-600"
                  onClick={() => removeMeasurement(measurement.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {part && selected ? (
          <>
            <p className="truncate pb-2 text-sm font-medium text-slate-900">{name ?? selected}</p>

            <dl className="divide-y divide-slate-100">
              <Row label="Volume" value={`${format(part.volume_mm3)} mm³`} />
              <Row label="Surface area" value={`${format(part.area_mm2)} mm²`} />
              <Row
                label="Centre of mass"
                value={part.com.map((v) => format(v, 1)).join(', ')}
              />
              <Row
                label="Size"
                value={part.bbox[1]
                  .map((high, axis) => format(high - part.bbox[0][axis], 1))
                  .join(' × ')}
              />
              <Row label="B-rep faces" value={String(faceCount)} />
              <Row
                label="Picked face"
                value={selectedFace === null ? '—' : `#${selectedFace}`}
              />
            </dl>

            {/* Volume and area come from the B-rep, not from the triangles on
                screen, so they stay exact regardless of tessellation quality. */}
            <p className="pt-3 text-xs leading-relaxed text-slate-400">
              Exact values from the B-rep, not measured off the mesh.
            </p>
          </>
        ) : (
          <p className="pt-1 text-xs text-slate-400">
            Select a part in the scene or in the assembly tree.
          </p>
        )}
      </div>

      <SectionControls metadata={metadata} />

      <div className="border-t border-slate-200 px-3 py-3">
        <label
          className={`flex items-center justify-between pb-1 text-xs ${
            measuring ? 'text-slate-300' : 'text-slate-500'
          }`}
          htmlFor="explode"
        >
          Explode
          <span className="font-mono tabular-nums">{explode.toFixed(2)}</span>
        </label>
        <input
          id="explode"
          type="range"
          min={0}
          max={2}
          step={0.01}
          value={explode}
          disabled={measuring}
          onChange={(event) => setExplode(Number(event.target.value))}
          className="w-full accent-blue-600 disabled:cursor-not-allowed disabled:accent-slate-300"
        />
        {measuring && (
          <p className="pt-1 text-[11px] text-slate-400">
            Disabled while measuring: measurements are in model coordinates.
          </p>
        )}
      </div>
    </aside>
  );
}
