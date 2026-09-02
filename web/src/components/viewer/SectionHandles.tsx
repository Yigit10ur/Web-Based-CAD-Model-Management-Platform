'use client';

import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

import type { BBox } from '@/lib/metadata';
import {
  axisDragPosition,
  handleOrigin,
  type SectionReference,
} from '@/lib/section';
import { useViewerStore } from '@/store/viewer-store';

/**
 * The section plane, draggable on the model.
 *
 * A triad the way a CAD package puts one on a section: three arrows on the
 * cut, and pulling one moves the cut along it. The panel does the same job in
 * numbers, and neither replaces the other -- a slider is how you say "exactly
 * halfway", a handle is how you say "here".
 *
 * Pulling an arrow also chooses that axis, which is what makes the triad a
 * complete control rather than an extra step after the buttons.
 */

const AXES: { reference: Exclude<SectionReference, 'custom'>; direction: THREE.Vector3; color: string }[] = [
  { reference: 'x', direction: new THREE.Vector3(1, 0, 0), color: '#dc2626' },
  { reference: 'y', direction: new THREE.Vector3(0, 1, 0), color: '#16a34a' },
  { reference: 'z', direction: new THREE.Vector3(0, 0, 1), color: '#2563eb' },
];

function Arrow({
  direction,
  color,
  length,
  active,
  onGrab,
}: {
  direction: THREE.Vector3;
  color: string;
  length: number;
  active: boolean;
  onGrab: (event: ThreeEvent<PointerEvent>) => void;
}) {
  // A cylinder and a cone are built along their own Y, so each is turned onto
  // the axis it stands for.
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction,
  );

  const shaft = length * 0.8;
  const width = length * 0.035;

  return (
    <group
      quaternion={quaternion}
      onPointerDown={onGrab}
      // Always grabbable, even where the model is in front of it: a handle
      // you can only reach from certain angles is a handle you distrust.
      renderOrder={999}
    >
      <mesh position={[0, shaft / 2, 0]}>
        <cylinderGeometry args={[width, width, shaft, 12]} />
        <meshBasicMaterial color={color} depthTest={false} opacity={active ? 1 : 0.75} transparent />
      </mesh>
      <mesh position={[0, shaft + length * 0.1, 0]}>
        <coneGeometry args={[width * 3, length * 0.2, 16]} />
        <meshBasicMaterial color={color} depthTest={false} opacity={active ? 1 : 0.75} transparent />
      </mesh>
      {/* Wider than it looks, so the arrow can be grabbed without hitting a
          three-pixel cone exactly. */}
      <mesh position={[0, shaft / 2, 0]} visible={false}>
        <cylinderGeometry args={[width * 6, width * 6, length, 8]} />
      </mesh>
    </group>
  );
}

export function SectionHandles({ bounds, size }: { bounds: BBox; size: number }) {
  const section = useViewerStore((state) => state.section);
  const setSection = useViewerStore((state) => state.setSection);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);

  /*
   * The drag is followed on the canvas rather than through R3F's pointer
   * events. R3F only delivers a move to the object under the cursor, and the
   * cursor leaves a thin arrow almost immediately -- a handle that only works
   * while you stay on top of it is not a handle. Listening on the canvas keeps
   * the drag alive wherever the pointer goes, which is what makes it possible
   * to pull the plane right across the model.
   */
  const grab = (reference: Exclude<SectionReference, 'custom'>) => (
    event: ThreeEvent<PointerEvent>,
  ) => {
    event.stopPropagation();

    const placement = { ...section, reference, rotateX: 0, rotateY: 0 };
    const origin = handleOrigin(placement, bounds);
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    setSection({ reference, rotateX: 0, rotateY: 0, dragging: true });

    const move = (moved: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((moved.clientX - rect.left) / rect.width) * 2 - 1,
        -((moved.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);

      const position = axisDragPosition(
        raycaster.ray.origin,
        raycaster.ray.direction,
        origin,
        placement,
        bounds,
      );

      if (position !== null) setSection({ position });
    };

    const release = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      setSection({ dragging: false });
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  };

  if (!section.enabled) return null;

  return (
    <group position={handleOrigin(section, bounds)}>
      {AXES.map((axis) => (
        <Arrow
          key={axis.reference}
          direction={axis.direction}
          color={axis.color}
          length={size * 0.28}
          active={section.reference === axis.reference}
          onGrab={grab(axis.reference)}
        />
      ))}
    </group>
  );
}
