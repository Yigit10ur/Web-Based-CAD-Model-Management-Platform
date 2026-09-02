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

import type { EdgeGeometry, FaceGeometry, SnapGeometry, Vec3 } from './metadata';

export type SnapKind = 'vertex' | 'edge' | 'face';

/**
 * What the cursor should be looking for.
 *
 * Measuring between two faces near their shared edge is otherwise impossible:
 * an edge within tolerance always wins, so the pick lands on the edge and the
 * face is unreachable. What is being measured decides what is worth snapping
 * to.
 */
export type SnapPreference = 'any' | 'edge' | 'face';

export interface SnapTarget {
  point: THREE.Vector3;
  kind: SnapKind;
  partId: string;
  /** Index into the part's edges for an edge snap, into its faces for a face. */
  index: number | null;
  /** Short description of what was snapped to, shown next to the cursor. */
  label: string;
  /** The B-rep edge itself, when an edge is what was hit. */
  edge?: EdgeGeometry;
  /**
   * Where to find the face's triangles, for measuring against another face
   * that is not parallel to it.
   *
   * References rather than copies: this is filled in on every pointer move,
   * and copying a face's vertices that often would be work done for nothing
   * almost every time.
   */
  surface?: {
    geometry: THREE.BufferGeometry;
    /** Index-unit range, three to a triangle -- the same the highlight draws. */
    start: number;
    count: number;
    /** Where the part is drawn, which an exploded view moves. */
    offset: THREE.Vector3;
  };
  /**
   * The B-rep face itself, when a face is what was hit.
   *
   * Carried along rather than looked up later: measuring between two surfaces
   * needs to know what kind of surfaces they are, and by then the part's snap
   * data is no longer to hand.
   */
  face?: FaceGeometry;
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
  /**
   * Active section plane, if any. Raycasting knows nothing about clipping, so
   * without this a measurement would happily snap to a corner that has been
   * sectioned away and is not on screen.
   */
  clip: THREE.Plane | null = null,
  wants: SnapPreference = 'any',
  surface: SnapTarget['surface'] = undefined,
): SnapTarget | null {
  const visible = (point: THREE.Vector3) => !clip || clip.distanceToPoint(point) >= 0;

  if (!visible(hit)) return null;

  const hitFace = faceIndex === null ? undefined : snap?.faces[faceIndex];

  const faceFallback: SnapTarget = {
    point: hit.clone(),
    kind: 'face',
    partId,
    index: faceIndex,
    label: hitFace?.kind ?? 'point',
    face: hitFace,
    surface,
  };

  // Asked for a face, give the face: an edge or a corner nearby is not what
  // is being measured, and letting one win makes the face unpickable at its
  // border.
  if (wants === 'face') return visible(hit) ? faceFallback : null;

  if (!snap) return wants === 'edge' ? null : faceFallback;

  let best: SnapTarget | null = null;
  let bestDistance = tolerance;

  if (wants !== 'edge') snap.vertices.forEach((vertex) => {
    const point = toVector(vertex);
    const distance = point.distanceTo(hit);
    if (distance < bestDistance && visible(point)) {
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
    if (distance < bestDistance && visible(point)) {
      best = { point, kind: 'edge', partId, index, label: describeEdge(edge), edge };
      bestDistance = distance;
    }
  });

  // Asked for an edge and none is near: nothing, rather than the face behind
  // it, so the reading cannot come from something that was not aimed at.
  if (wants === 'edge') return best;

  return best ?? faceFallback;
}
