'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * One B-rep face, lit up.
 *
 * Measuring between two faces asks you to aim at a surface, and until now
 * nothing on screen said which surface the cursor had found or which one had
 * already been taken. A marker at the point is not enough: the point is on a
 * face, and the face is what is being measured.
 *
 * The geometry here shares its buffers with the part's own -- only the range
 * of it that gets drawn is different. Copying the triangles instead would put
 * a second mesh on the card for every face anyone points at.
 */
export function FaceHighlight({
  geometry,
  range,
  color,
  clip,
}: {
  geometry: THREE.BufferGeometry;
  range: { start: number; count: number };
  color: string;
  clip: THREE.Plane | null;
}) {
  const sliced = useMemo(() => {
    const sub = new THREE.BufferGeometry();

    for (const name of ['position', 'normal'] as const) {
      const attribute = geometry.getAttribute(name);
      if (attribute) sub.setAttribute(name, attribute);
    }
    if (geometry.index) sub.setIndex(geometry.index);

    sub.setDrawRange(range.start, range.count);
    return sub;
  }, [geometry, range.start, range.count]);

  return (
    <mesh
      geometry={sliced}
      raycast={() => null}
      /*
       * Never disposed: the buffers underneath belong to the part's own mesh,
       * and freeing them here would take the part with it.
       */
      dispose={null}
    >
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.55}
        side={THREE.DoubleSide}
        clippingPlanes={clip ? [clip] : []}
        // Pulled towards the camera, or it fights the surface it is drawn on
        // and comes out as speckle.
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
}
