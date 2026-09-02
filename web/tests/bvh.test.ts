/**
 * The accelerated raycasting must not renumber the triangles.
 *
 * This one is worth a file of its own because of how it failed. Nothing threw,
 * nothing looked broken at first, and the picture was identical -- the same
 * triangles were drawn, in a different order. But this application reads
 * meaning out of that order: `face_groups` says which triangles came from
 * which B-rep face, and a raycast hit becomes a face by asking where its
 * triangle number falls.
 *
 * Reordered, every one of those answers is about a different face. The
 * highlight lit up triangles from all over the part, and the surfaces measured
 * against each other were not the ones that had been clicked.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { buildBoundsTree } from '@/lib/bvh';

/** Enough triangles, spread out enough, that a spatial sort would rearrange. */
function scattered(count: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  let seed = 99;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  for (let i = 0; i < count; i += 1) {
    const x = random() * 100;
    const y = random() * 100;
    const z = random() * 100;
    positions.push(x, y, z, x + 1, y, z, x, y + 1, z);
    indices.push(i * 3, i * 3 + 1, i * 3 + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

describe('building the bounds tree', () => {
  it('leaves the index exactly as it found it', () => {
    /*
     * The whole of it. Left to itself the library sorts the triangles
     * spatially and rewrites the index to match -- on the assembly this was
     * found in, 2939 of 2952 indices moved.
     */
    const geometry = scattered(200);
    const before = Uint32Array.from(geometry.getIndex()!.array);

    buildBoundsTree(geometry);

    const after = Uint32Array.from(geometry.getIndex()!.array);
    expect(Array.from(after)).toEqual(Array.from(before));
  });

  it('still answers a raycast with the triangle that was hit', () => {
    /*
     * Keeping the order would be no use if it stopped reporting hits, or
     * reported them against its own numbering. Checked against the plain
     * raycaster on the same ray.
     */
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          // Two triangles, one at z = 0 and one at z = 10.
          0, 0, 0, 10, 0, 0, 0, 10, 0,
          0, 0, 10, 10, 0, 10, 0, 10, 10,
        ],
        3,
      ),
    );
    geometry.setIndex([0, 1, 2, 3, 4, 5]);

    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);

    buildBoundsTree(geometry);

    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(1, 1, 20), new THREE.Vector3(0, 0, -1));
    const hits = ray.intersectObject(mesh, false);

    // The nearer triangle is the second one in the buffer, which is the
    // number the face groups would be looked up with.
    expect(hits[0]?.faceIndex).toBe(1);
  });
});
