'use client';

import { useMemo } from 'react';

import type { ModelMetadata } from '@/lib/metadata';
import {
  cutDistance,
  describeNormal,
  modelBounds,
  type SectionReference,
} from '@/lib/section';
import { useViewerStore } from '@/store/viewer-store';

const STANDARD: Exclude<SectionReference, 'custom'>[] = ['x', 'y', 'z'];

/** The slider runs 0..1 across the model, so its midpoint is the middle. */
const CENTRE = 0.5;

/**
 * One rotation dial.
 *
 * A slider to sweep with and a box to type in, because both are wanted: you
 * drag to find the angle that shows the feature, and you type when the angle
 * is a number the part was designed around.
 */
function Dial({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 font-mono text-[11px] text-slate-500">{label}</span>
      <input
        type="range"
        min={-90}
        max={90}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-w-0 flex-1 accent-blue-600"
        aria-label={`Rotate the section plane about ${label}`}
      />
      <input
        type="number"
        min={-90}
        max={90}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="tabular w-14 rounded border border-slate-300 px-1 py-0.5 text-right font-mono text-[11px] text-slate-900"
        aria-label={`${label} angle in degrees`}
      />
      <span className="text-[11px] text-slate-400">°</span>
    </div>
  );
}

export function SectionControls({ metadata }: { metadata: ModelMetadata }) {
  const section = useViewerStore((state) => state.section);
  const setSection = useViewerStore((state) => state.setSection);

  const bounds = useMemo(() => modelBounds(metadata.parts), [metadata]);

  // Half a step either side: the slider cannot express a position closer to the
  // middle than this, so anything within it already is the middle.
  const centred = Math.abs(section.position - CENTRE) < 0.0005;
  const tilted = section.rotateX !== 0 || section.rotateY !== 0;
  // The slider is normalised across the model; the readout is in millimetres,
  // because that is the number someone reading a section actually wants.
  const at = cutDistance(section, bounds);

  /**
   * Whether there is a flat face anywhere to borrow a direction from.
   *
   * Asked of the data rather than of `geometry_source`, which is a label the
   * converter only started writing later -- the bundled sample has no such
   * field and every planar face in the file, and a check on the label hid the
   * button on exactly the model most people meet first.
   */
  const canPickFace = useMemo(
    () =>
      Object.values(metadata.snap ?? {}).some((part) =>
        part.faces?.some((face) => face.kind === 'plane' && face.normal),
      ),
    [metadata],
  );

  return (
    <div className="border-t border-slate-200 px-3 py-3">
      <div className="flex items-center justify-between pb-2">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={section.enabled}
            onChange={(event) =>
              setSection({ enabled: event.target.checked, picking: false, pickError: null })
            }
            className="accent-blue-600"
          />
          Section
        </label>

        {section.enabled && (
          <span className="tabular font-mono text-xs text-slate-900">
            {at.toFixed(2)} mm
          </span>
        )}
      </div>

      {section.enabled && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <div className="flex overflow-hidden rounded border border-slate-300">
              {STANDARD.map((reference) => (
                <button
                  key={reference}
                  type="button"
                  className={`px-2.5 py-1 text-xs font-medium ${
                    reference === section.reference && !section.picking
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  onClick={() =>
                    setSection({
                      reference,
                      // The dials measure from the reference, so a new one
                      // starts level rather than inheriting the old tilt.
                      rotateX: 0,
                      rotateY: 0,
                      picking: false,
                      pickError: null,
                    })
                  }
                >
                  {reference.toUpperCase()}
                </button>
              ))}

              {/* The CAD way of getting a plane that is not one of the three:
                  borrow the direction of a face the part already has. */}
              {canPickFace && (
                <button
                  type="button"
                  className={`border-l border-slate-300 px-2.5 py-1 text-xs font-medium ${
                    section.picking
                      ? 'bg-amber-500 text-white'
                      : section.reference === 'custom'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  onClick={() =>
                    setSection({ picking: !section.picking, pickError: null })
                  }
                  title="Cut along a flat face of the model"
                >
                  face
                </button>
              )}
            </div>

            <button
              type="button"
              className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
              onClick={() => setSection({ flipped: !section.flipped })}
              title="Keep the other half"
            >
              flip
            </button>

            {/* Cutting through the middle is the section people want most often
                and the one a slider is worst at hitting: half a pixel of travel
                is tenths of a millimetre, and the result looks centred without
                being centred. */}
            <button
              type="button"
              disabled={centred}
              className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:border-slate-200 disabled:text-slate-300"
              onClick={() => setSection({ position: CENTRE })}
              title="Cut through the middle of the model"
            >
              centre
            </button>
          </div>

          {section.picking && (
            <p className="rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
              Click a flat face to cut along it. A curved face has a different
              direction at every point, so there is nothing to borrow.
            </p>
          )}

          {section.pickError && !section.picking && (
            <p className="text-[11px] text-red-700">{section.pickError}</p>
          )}

          {/* Worth showing only once the direction has stopped being a named
              axis, which is exactly when its numbers start carrying meaning. */}
          {(section.reference === 'custom' || tilted) && (
            <p className="tabular font-mono text-[11px] text-slate-500">
              n = {describeNormal(section)}
            </p>
          )}

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

          <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Rotate</span>
              <button
                type="button"
                disabled={!tilted}
                className="text-[11px] text-slate-500 hover:text-slate-900 disabled:text-slate-300"
                onClick={() => setSection({ rotateX: 0, rotateY: 0 })}
              >
                reset
              </button>
            </div>

            <Dial
              label="X"
              value={section.rotateX}
              onChange={(rotateX) => setSection({ rotateX })}
            />
            <Dial
              label="Y"
              value={section.rotateY}
              onChange={(rotateY) => setSection({ rotateY })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
