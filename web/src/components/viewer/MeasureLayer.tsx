'use client';

import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';

import type { Framing } from '@/lib/framing';
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
              text={`${measurement.distance.toFixed(2)} mm`}
              tone="measured"
            />
          </group>
        );
      })}

      {pending && (
        <Marker point={pending.point} color={PENDING_COLOR} radius={view.markerRadius} />
      )}

      {/* The rubber band from the first point to wherever the cursor has
          snapped, so the length is readable before the second click. */}
      {pending && hover && (
        <>
          <Line
            points={[pending.point, hover.point]}
            color={PENDING_COLOR}
            lineWidth={1.5}
            dashed
            dashSize={view.dashSize}
            gapSize={view.gapSize}
            depthTest={false}
          />
          <Label
            point={pending.point.clone().lerp(hover.point, 0.5)}
            text={`${pending.point.distanceTo(hover.point).toFixed(2)} mm`}
            tone="hover"
          />
        </>
      )}

      {tool === 'measure' && hover && (
        <>
          <Marker point={hover.point} color={HOVER_COLOR} radius={view.markerRadius} />
          {!pending && <Label point={hover.point} text={hover.label} tone="hover" />}
        </>
      )}
    </group>
  );
}
