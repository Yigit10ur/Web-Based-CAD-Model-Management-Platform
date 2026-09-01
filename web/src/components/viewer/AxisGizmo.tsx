'use client';

import { useState } from 'react';
import { Html } from '@react-three/drei';

import { AXIS_HEADS, type AxisHead } from '@/lib/views';
import { useViewerStore } from '@/store/viewer-store';

/**
 * The axis indicator, and the quickest way to a standard view.
 *
 * Drawn here rather than with drei's `GizmoViewport` because that one moves
 * the camera itself, and it works out how far to move it from the distance to
 * the world origin rather than to what is being looked at -- which sends the
 * camera past any assembly that is not sitting on the origin, leaving a blank
 * screen. The drawing was never the problem; the arithmetic behind the click
 * was. So the click goes to `setView`, which knows where the model is.
 *
 * Rendered inside drei's `GizmoHelper`, which is still what puts a small
 * second scene in the corner and keeps it turned the way the model is.
 */

const AXES: { to: [number, number, number]; color: string }[] = [
  { to: [1, 0, 0], color: '#dc2626' },
  { to: [0, 1, 0], color: '#16a34a' },
  { to: [0, 0, 1], color: '#2563eb' },
];

function Axis({ to, color }: { to: [number, number, number]; color: string }) {
  // Half the length, positioned at the midpoint: a cylinder is built along its
  // own Y, so it is turned onto the axis it belongs to.
  const rotation: [number, number, number] =
    to[0] === 1 ? [0, 0, -Math.PI / 2] : to[2] === 1 ? [Math.PI / 2, 0, 0] : [0, 0, 0];

  return (
    <mesh position={[to[0] / 2, to[1] / 2, to[2] / 2]} rotation={rotation}>
      <cylinderGeometry args={[0.05, 0.05, 1, 8]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

function Head({ head }: { head: AxisHead }) {
  const setView = useViewerStore((state) => state.setView);
  const [hovered, setHovered] = useState(false);

  // The negative heads are hollow until pointed at, the way a view cube marks
  // the side facing away.
  const solid = head.label !== '' || hovered;

  return (
    <mesh
      position={head.at}
      scale={hovered ? 1.25 : 1}
      onPointerDown={(event) => {
        event.stopPropagation();
        setView(head.view);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[0.22, 16, 16]} />
      <meshBasicMaterial
        color={head.color}
        toneMapped={false}
        transparent={!solid}
        opacity={solid ? 1 : 0.45}
      />
      {head.label && (
        <Html center style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <span className="font-mono text-[10px] font-bold text-white">{head.label}</span>
        </Html>
      )}
    </mesh>
  );
}

export function AxisGizmo() {
  return (
    <group scale={40}>
      {AXES.map((axis) => (
        <Axis key={axis.color} {...axis} />
      ))}
      {AXIS_HEADS.map((head) => (
        <Head key={head.view} head={head} />
      ))}
    </group>
  );
}
