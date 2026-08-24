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
