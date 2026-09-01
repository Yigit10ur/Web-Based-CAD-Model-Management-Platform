'use client';

import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';

import type { Framing } from '@/lib/framing';
import { formatMeasurement, measure } from '@/lib/measure';
import type { SnapTarget } from '@/lib/snap';
import { useViewerStore } from '@/store/viewer-store';

const PENDING_COLOR = '#f59e0b';
const MEASURED_COLOR = '#0f766e';
const HOVER_COLOR = '#2563eb';

function Marker({
  point,
  color,
  radius,
}: {
  point: THREE.Vector3;
  color: string;
  radius: number;
}) {
  return (
    <mesh position={point} raycast={() => null}>
      <sphereGeometry args={[radius, 16, 16]} />
      <meshBasicMaterial color={color} depthTest={false} />
    </mesh>
  );
}

function Label({
  point,
  text,
  tone,
}: {
  point: THREE.Vector3;
  text: string;
  tone: 'hover' | 'measured';
}) {
  return (
    // No distanceFactor: it scales the label by the camera's distance, so a
    // reading grows as you zoom in to take it and swallows the feature being
    // measured. A dimension is an annotation, not part of the model -- it
    // belongs at a constant size on screen, the way a CAD drawing labels one.
    <Html position={point} center zIndexRange={[10, 0]}>
      <div
        className={`pointer-events-none rounded px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap shadow-sm ${
          tone === 'hover' ? 'bg-blue-600 text-white' : 'bg-teal-700 text-white'
        }`}
      >
        {text}
      </div>
    </Html>
  );
}

function Preview({
  from,
  to,
  view,
}: {
  from: SnapTarget;
  to: SnapTarget;
  view: Framing;
}) {
  const result = measure(from, to);

  return (
    <>
      <Line
        points={[result.from, result.to]}
        color={PENDING_COLOR}
        lineWidth={1.5}
        dashed
        dashSize={view.dashSize}
        gapSize={view.gapSize}
        depthTest={false}
      />
      <Label
        point={result.from.clone().lerp(result.to, 0.5)}
        text={formatMeasurement(result.value, result.unit)}
        tone="hover"
      />
    </>
  );
}

export function MeasureLayer({ view }: { view: Framing }) {
  const tool = useViewerStore((state) => state.tool);
  const hover = useViewerStore((state) => state.hover);
  const pending = useViewerStore((state) => state.pending);
  const measurements = useViewerStore((state) => state.measurements);

  return (
    <group>
      {measurements.map((measurement) => {
        const midpoint = measurement.from.clone().lerp(measurement.to, 0.5);
        return (
          <group key={measurement.id}>
            <Line
              points={[measurement.from, measurement.to]}
              color={MEASURED_COLOR}
              lineWidth={2}
              depthTest={false}
            />
            <Marker point={measurement.from} color={MEASURED_COLOR} radius={view.markerRadius} />
            <Marker point={measurement.to} color={MEASURED_COLOR} radius={view.markerRadius} />
            <Label
              point={midpoint}
              text={formatMeasurement(measurement.value, measurement.unit)}
              tone="measured"
            />
          </group>
        );
      })}

      {pending && (
        <Marker point={pending.point} color={PENDING_COLOR} radius={view.markerRadius} />
      )}

      {/* The rubber band from the first pick to wherever the cursor has
          snapped, so the reading is there before the second click -- and the
          same reading, worked out the same way, rather than a point-to-point
          preview of a measurement that will turn out to be a gap. */}
      {pending && hover && <Preview from={pending} to={hover} view={view} />}

      {tool === 'measure' && hover && (
        <>
          <Marker point={hover.point} color={HOVER_COLOR} radius={view.markerRadius} />
          {!pending && <Label point={hover.point} text={hover.label} tone="hover" />}
        </>
      )}
    </group>
  );
}
