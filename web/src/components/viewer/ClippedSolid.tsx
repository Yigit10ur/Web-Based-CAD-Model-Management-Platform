'use client';

import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Capping a clipped solid.
 *
 * A clipping plane on its own leaves a part looking hollow: you see straight
 * through the cut into the inside of the far wall, which reads as a broken
 * model rather than as a section. The fix is the standard stencil trick --
 * count back faces minus front faces in front of the plane, and fill the cut
 * wherever the count is non-zero, which is exactly where the plane passes
 * through solid material.
 *
 * The cap is drawn per part so it takes that part's own colour, the way a
 * section view in a CAD package does.
 */

interface Props {
  geometry: THREE.BufferGeometry;
  plane: THREE.Plane;
  color: THREE.Color;
  /** Cap quad size; anything at least as large as the model works. */
  size: number;
  /** Keeps each part's stencil pass and cap paired and ordered. */
  order: number;
}

export function ClippedSolid({ geometry, plane, color, size, order }: Props) {
  const cap = useRef<THREE.Mesh>(null);

  useLayoutEffect(() => {
    if (!cap.current) return;

    // Sit the quad on the plane, facing along its normal.
    const point = new THREE.Vector3();
    plane.coplanarPoint(point);
    cap.current.position.copy(point);
    cap.current.lookAt(point.clone().add(plane.normal));
  }, [plane]);

  const stencilBase = {
    depthWrite: false,
    depthTest: false,
    colorWrite: false,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
    clippingPlanes: [plane],
  } as const;

  return (
    <group>
      {/* Back faces increment, front faces decrement. What is left is the
          material the plane cut through. */}
      <mesh geometry={geometry} renderOrder={order} raycast={() => null}>
        <meshBasicMaterial
          {...stencilBase}
          side={THREE.BackSide}
          stencilFail={THREE.IncrementWrapStencilOp}
          stencilZFail={THREE.IncrementWrapStencilOp}
          stencilZPass={THREE.IncrementWrapStencilOp}
        />
      </mesh>

      <mesh geometry={geometry} renderOrder={order} raycast={() => null}>
        <meshBasicMaterial
          {...stencilBase}
          side={THREE.FrontSide}
          stencilFail={THREE.DecrementWrapStencilOp}
          stencilZFail={THREE.DecrementWrapStencilOp}
          stencilZPass={THREE.DecrementWrapStencilOp}
        />
      </mesh>

      <mesh
        ref={cap}
        renderOrder={order + 0.1}
        raycast={() => null}
        // The stencil buffer is shared, so this part has to hand it back
        // cleared or the next part's cap would inherit its counts.
        onAfterRender={(renderer) => renderer.clearStencil()}
      >
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial
          color={color}
          side={THREE.DoubleSide}
          metalness={0}
          roughness={0.85}
          stencilWrite
          stencilRef={0}
          stencilFunc={THREE.NotEqualStencilFunc}
          stencilFail={THREE.ReplaceStencilOp}
          stencilZFail={THREE.ReplaceStencilOp}
          stencilZPass={THREE.ReplaceStencilOp}
        />
      </mesh>
    </group>
  );
}
