'use client';

import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';

import { useViewerStore } from '@/store/viewer-store';

const PENDING_COLOR = '#f59e0b';
const MEASURED_COLOR = '#0f766e';
const HOVER_COLOR = '#2563eb';

function Marker({ point, color }: { point: THREE.Vector3; color: string }) {
  return (
    <mesh position={point} raycast={() => null}>
      {/* Sized in screen space would be better; at MVP model sizes a fixed
          radius reads well enough and costs nothing. */}
      <sphereGeometry args={[0.6, 16, 16]} />
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
    <Html position={point} center distanceFactor={120} zIndexRange={[10, 0]}>
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

export function MeasureLayer() {
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
            <Marker point={measurement.from} color={MEASURED_COLOR} />
            <Marker point={measurement.to} color={MEASURED_COLOR} />
            <Label
              point={midpoint}
              text={`${measurement.distance.toFixed(2)} mm`}
              tone="measured"
            />
          </group>
        );
      })}

      {pending && <Marker point={pending.point} color={PENDING_COLOR} />}

      {/* The rubber band from the first point to wherever the cursor has
          snapped, so the length is readable before the second click. */}
      {pending && hover && (
        <>
          <Line
            points={[pending.point, hover.point]}
            color={PENDING_COLOR}
            lineWidth={1.5}
            dashed
            dashSize={1.5}
            gapSize={1}
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
          <Marker point={hover.point} color={HOVER_COLOR} />
          {!pending && <Label point={hover.point} text={hover.label} tone="hover" />}
        </>
      )}
    </group>
  );
}
