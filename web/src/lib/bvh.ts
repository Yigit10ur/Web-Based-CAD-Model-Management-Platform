/**
 * Accelerated raycasting for picking.
 *
 * three.js raycasts a mesh by walking every triangle, which is fine for the
 * sample and unusable for a real assembly. Patching in three-mesh-bvh here,
 * once, keeps the picking code in the components ordinary.
 */

import { Mesh, BufferGeometry } from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

/**
 * Build the tree without letting it rearrange the mesh.
 *
 * By default three-mesh-bvh sorts the triangles spatially and rewrites the
 * geometry's index in place to match. Nothing about the picture changes -- the
 * same triangles are drawn -- but the numbering does, and this application
 * reads meaning out of that numbering: `face_groups` says which triangles came
 * from which B-rep face, and a raycast hit is turned into a face by asking
 * where its triangle number falls. Reorder the triangles and every one of
 * those answers is about a different face.
 *
 * It went unnoticed because nothing *looks* wrong until a face is drawn: the
 * highlight lit up triangles from all over the part, and the surfaces measured
 * against each other were not the ones anyone clicked.
 *
 * `indirect` keeps its ordering in a table of its own and leaves the mesh
 * alone. Verified against an unaccelerated raycast over the real assembly: 152
 * hits, same triangle and same face every time.
 */
export function buildBoundsTree(geometry: BufferGeometry): void {
  geometry.computeBoundsTree?.({ indirect: true });
}
