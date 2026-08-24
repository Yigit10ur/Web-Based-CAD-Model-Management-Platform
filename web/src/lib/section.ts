/**
 * The section (clipping) plane.
 *
 * The plane is stored as an axis plus a 0..1 position across the model's
 * bounding box rather than as a world coordinate, so the control behaves the
 * same whatever the model's size and wherever it sits in space.
 */

import * as THREE from 'three';

import type { BBox, PartMetadata } from './metadata';

export type SectionAxis = 'x' | 'y' | 'z';

const AXIS_INDEX: Record<SectionAxis, number> = { x: 0, y: 1, z: 2 };

const AXIS_NORMAL: Record<SectionAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

/** Bounding box of the whole model, in CAD coordinates. */
export function modelBounds(parts: Record<string, PartMetadata>): BBox {
  const entries = Object.values(parts);
  if (entries.length === 0) {
    return [
      [0, 0, 0],
      [1, 1, 1],
    ];
  }

  const low: [number, number, number] = [Infinity, Infinity, Infinity];
  const high: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const part of entries) {
    for (let axis = 0; axis < 3; axis += 1) {
      low[axis] = Math.min(low[axis], part.bbox[0][axis]);
      high[axis] = Math.max(high[axis], part.bbox[1][axis]);
    }
  }

  return [low, high];
}

/**
 * Build the clipping plane.
 *
 * The plane is nudged just past the bounding box at the extremes so that the
 * slider can be taken fully to either end without a sliver of the model being
 * clipped away when the user meant "off".
 */
export function sectionPlane(
  axis: SectionAxis,
  position: number,
  flipped: boolean,
  bounds: BBox,
): THREE.Plane {
  const index = AXIS_INDEX[axis];
  const low = bounds[0][index];
  const high = bounds[1][index];
  const margin = (high - low) * 0.001;
  const at = low - margin + (high - low + margin * 2) * position;

  // three.js keeps the half space where normal . point + constant > 0. With
  // the normal pointing back down the axis, that is everything below `at`;
  // flipping the normal keeps the other half instead.
  const sign = flipped ? 1 : -1;
  const normal = AXIS_NORMAL[axis].clone().multiplyScalar(sign);
  return new THREE.Plane(normal, -sign * at);
}
