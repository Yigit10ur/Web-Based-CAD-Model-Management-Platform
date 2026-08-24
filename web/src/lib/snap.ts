/**
 * Snapping a pointer hit onto exact CAD geometry.
 *
 * The mesh on screen is an approximation chosen for display: a corner sampled
 * off it is off by the tessellation error, and a diameter fitted to a polyline
 * is short by the chord error. Every measurement therefore resolves to the
 * B-rep data the converter exported (ARCHITECTURE.md section 10), and the
 * triangle that was hit is used only to decide *which* piece of geometry the
 * user meant.
 *
 * Priority is vertex, then edge, then the raw point on the face -- corners are
 * what people aim at, and they are the hardest to hit with a bare cursor.
 */

import * as THREE from 'three';

import type { EdgeGeometry, SnapGeometry, Vec3 } from './metadata';

export type SnapKind = 'vertex' | 'edge' | 'face';

export interface SnapTarget {
  point: THREE.Vector3;
  kind: SnapKind;
  partId: string;
  /** Index into the part's edges for an edge snap, into its faces for a face. */
  index: number | null;
  /** Short description of what was snapped to, shown next to the cursor. */
  label: string;
}

const scratch = new THREE.Vector3();

function toVector(vec: Vec3): THREE.Vector3 {
  return new THREE.Vector3(vec[0], vec[1], vec[2]);
}

/** Closest point on a straight edge, clamped to its ends. */
function closestOnSegment(
  point: THREE.Vector3,
  start: THREE.Vector3,
  end: THREE.Vector3,
): THREE.Vector3 {
  const direction = end.clone().sub(start);
  const lengthSquared = direction.lengthSq();
  if (lengthSquared === 0) return start.clone();

  const t = THREE.MathUtils.clamp(
    point.clone().sub(start).dot(direction) / lengthSquared,
    0,
    1,
  );
  return start.clone().addScaledVector(direction, t);
}

/**
 * Closest point on a circular edge.
 *
 * Projects onto the circle's plane and pushes out to the radius, so the result
 * sits on the true circle rather than on the polygon that approximates it.
 * Arcs are treated as full circles here; clamping to the arc needs the
 * parameter range, which the converter does not export yet.
 */
function closestOnCircle(
  point: THREE.Vector3,
  centre: THREE.Vector3,
  axis: THREE.Vector3,
  radius: number,
): THREE.Vector3 {
  const offset = point.clone().sub(centre);
  const inPlane = offset.sub(scratch.copy(axis).multiplyScalar(offset.dot(axis)));

  if (inPlane.lengthSq() === 0) return centre.clone();
  return centre.clone().addScaledVector(inPlane.normalize(), radius);
}

function closestOnEdge(point: THREE.Vector3, edge: EdgeGeometry): THREE.Vector3 {
  if (edge.kind === 'circle' && edge.centre && edge.axis && edge.radius !== null) {
    return closestOnCircle(point, toVector(edge.centre), toVector(edge.axis), edge.radius);
  }
  return closestOnSegment(point, toVector(edge.start), toVector(edge.end));
}

function describeEdge(edge: EdgeGeometry): string {
  if (edge.kind === 'circle' && edge.radius !== null) {
    return `⌀ ${(edge.radius * 2).toFixed(2)} mm`;
  }
  return `edge ${edge.length.toFixed(2)} mm`;
}

/**
 * Resolve a pointer hit to the nearest exact geometry.
 *
 * `tolerance` is a world-space distance; callers scale it with the model size
 * so the behaviour is the same on a bracket and on a chassis.
 */
export function snapTo(
  hit: THREE.Vector3,
  partId: string,
  snap: SnapGeometry | undefined,
  faceIndex: number | null,
  tolerance: number,
): SnapTarget {
  const faceFallback: SnapTarget = {
    point: hit.clone(),
    kind: 'face',
    partId,
    index: faceIndex,
    label: snap?.faces[faceIndex ?? -1]?.kind ?? 'point',
  };

  if (!snap) return faceFallback;

  let best: SnapTarget | null = null;
  let bestDistance = tolerance;

  snap.vertices.forEach((vertex) => {
    const point = toVector(vertex);
    const distance = point.distanceTo(hit);
    if (distance < bestDistance) {
      best = { point, kind: 'vertex', partId, index: null, label: 'corner' };
      bestDistance = distance;
    }
  });

  // A corner within tolerance always wins: it is a single exact location,
  // while an edge is a whole line of them.
  if (best) return best;

  snap.edges.forEach((edge, index) => {
    const point = closestOnEdge(hit, edge);
    const distance = point.distanceTo(hit);
    if (distance < bestDistance) {
      best = { point, kind: 'edge', partId, index, label: describeEdge(edge) };
      bestDistance = distance;
    }
  });

  return best ?? faceFallback;
}
