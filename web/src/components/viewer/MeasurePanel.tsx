'use client';

import {
  MEASURE_MODES,
  MEASURE_UNITS,
  type MeasureMode,
  type MeasureUnit,
} from '@/lib/measure';
import { useViewerStore } from '@/store/viewer-store';

/**
 * What to measure, chosen before measuring.
 *
 * The same list a CAD viewer offers, and in the same order, because it is the
 * order the questions come in: a length, then the two readings a circle gives,
 * then the ones that take two picks.
 *
 * Choosing first is not ceremony. A circular edge answers three different
 * questions and nothing about the click says which was meant, and a face
 * measurement needs the cursor to stop snapping to the edges around the face.
 */
export function MeasurePanel() {
  const mode = useViewerStore((state) => state.measureMode);
  const setMode = useViewerStore((state) => state.setMeasureMode);
  const unit = useViewerStore((state) => state.measureUnit);
  const setUnit = useViewerStore((state) => state.setMeasureUnit);
  const error = useViewerStore((state) => state.measureError);
  const measurements = useViewerStore((state) => state.measurements);
  const clearMeasurements = useViewerStore((state) => state.clearMeasurements);

  return (
    <div className="flex flex-col gap-2 border-b border-slate-200 px-3 py-3">
      <div className="flex flex-col gap-1">
        {MEASURE_MODES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setMode(entry.id as MeasureMode)}
            className={`rounded px-2 py-1.5 text-left text-xs transition-colors ${
              entry.id === mode
                ? 'bg-blue-600 font-medium text-white'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {/* Why the last pick was refused. A mode that simply did nothing would
          leave someone clicking a straight edge for its radius forever. */}
      {error && (
        <p className="rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">{error}</p>
      )}

      <button
        type="button"
        disabled={measurements.length === 0}
        onClick={clearMeasurements}
        className="rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:border-slate-200 disabled:text-slate-300"
      >
        Clear measurements
      </button>

      <label className="flex flex-col gap-1 pt-1 text-[11px] text-slate-500">
        Measurement unit
        <select
          value={unit}
          onChange={(event) => setUnit(event.target.value as MeasureUnit)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
        >
          {MEASURE_UNITS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
