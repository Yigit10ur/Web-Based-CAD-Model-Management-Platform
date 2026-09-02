/**
 * How close two surfaces come to each other.
 *
 * Two faces that meet have no single distance between them -- but two that do
 * *not* meet have exactly one worth knowing, and it is the one people ask for:
 * the gap between a fin and the plate beside it, between a boss and the wall
 * it stands off from. Those faces are usually at right angles, which is
 * precisely the case the plane-to-plane arithmetic has nothing to say about.
 *
 * Measured on the triangles, which for a planar face is not an approximation:
 * a flat face tessellates into triangles that lie on it and tile it exactly,
 * so the triangles are the face. That is true of no other kind of surface,
 * which is why only planar faces are offered this.
 */

import * as THREE from 'three';

export type Triangle = [THREE.Vector3, THREE.Vector3, THREE.Vector3];

/** The closest the two surfaces come, and where. */
export interface Approach {
  distance: number;
  on: THREE.Vector3;
  to: THREE.Vector3;
}

/**
 * The triangles of one face, in the coordinates it is drawn at.
 *
 * `start` and `count` are in index units, three to a triangle -- the same
 * range the highlight draws.
 */
export function trianglesOf(
  geometry: THREE.BufferGeometry,
  start: number,
  count: number,
  offset: THREE.Vector3,
): Triangle[] {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!position) return [];

  const vertex = (at: number) => {
    const i = index ? index.getX(at) : at;
    return new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)).add(offset);
  };

  const triangles: Triangle[] = [];
  const last = Math.min(start + count, index ? index.count : position.count);

  for (let at = start; at + 2 < last; at += 3) {
    triangles.push([vertex(at), vertex(at + 1), vertex(at + 2)]);
  }

  return triangles;
}

/** The point of a triangle nearest some other point. */
export function closestOnTriangle(
  point: THREE.Vector3,
  [a, b, c]: Triangle,
): THREE.Vector3 {
  // Ericson, Real-Time Collision Detection, by way of the barycentric regions.
  const ab = b.clone().sub(a);
  const ac = c.clone().sub(a);
  const ap = point.clone().sub(a);

  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return a.clone();

  const bp = point.clone().sub(b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return b.clone();

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    return a.clone().addScaledVector(ab, d1 / (d1 - d3));
  }

  const cp = point.clone().sub(c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return c.clone();

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    return a.clone().addScaledVector(ac, d2 / (d2 - d6));
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    return b.clone().addScaledVector(c.clone().sub(b), (d4 - d3) / (d4 - d3 + (d5 - d6)));
  }

  const denominator = 1 / (va + vb + vc);
  return a
    .clone()
    .addScaledVector(ab, vb * denominator)
    .addScaledVector(ac, vc * denominator);
}

/** The closest two line segments come, and where on each. */
export function closestBetweenSegments(
  p1: THREE.Vector3,
  q1: THREE.Vector3,
  p2: THREE.Vector3,
  q2: THREE.Vector3,
): Approach {
  const d1 = q1.clone().sub(p1);
  const d2 = q2.clone().sub(p2);
  const r = p1.clone().sub(p2);

  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);

  let s = 0;
  let t = 0;

  // Either segment can be a point, which happens in degenerate triangles.
  if (a <= 1e-12 && e <= 1e-12) {
    return { distance: p1.distanceTo(p2), on: p1.clone(), to: p2.clone() };
  }

  if (a <= 1e-12) {
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = d1.dot(r);
    if (e <= 1e-12) {
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = d1.dot(d2);
      const denominator = a * e - b * b;

      // Parallel segments: any s does, so take the start and clamp t to it.
      s = denominator !== 0 ? THREE.MathUtils.clamp((b * f - c * e) / denominator, 0, 1) : 0;

      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }

  const on = p1.clone().addScaledVector(d1, s);
  const to = p2.clone().addScaledVector(d2, t);
  return { distance: on.distanceTo(to), on, to };
}

const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 0],
];

/**
 * The closest two triangles come.
 *
 * Every case has to be looked at: the nearest pair of points can be a corner
 * against a face, or two edges crossing in mid-air with no corner involved at
 * all. Checking only corners is the mistake that makes two edges sliding past
 * each other read as further apart than they are.
 */
export function closestBetweenTriangles(first: Triangle, second: Triangle): Approach {
  let best: Approach = { distance: Infinity, on: first[0], to: second[0] };

  const consider = (candidate: Approach) => {
    if (candidate.distance < best.distance) best = candidate;
  };

  for (const corner of first) {
    const to = closestOnTriangle(corner, second);
    consider({ distance: corner.distanceTo(to), on: corner.clone(), to });
  }

  for (const corner of second) {
    const on = closestOnTriangle(corner, first);
    consider({ distance: corner.distanceTo(on), on, to: corner.clone() });
  }

  for (const [a, b] of EDGES) {
    for (const [c, d] of EDGES) {
      consider(closestBetweenSegments(first[a], first[b], second[c], second[d]));
    }
  }

  return best;
}

/** A box round a triangle, for skipping pairs that cannot beat what we have. */
function boxOf(triangle: Triangle): THREE.Box3 {
  return new THREE.Box3().setFromPoints(triangle);
}

/**
 * How far apart two boxes are, which is zero when they overlap.
 *
 * Written out rather than taken from three, which has no such method -- and a
 * lower bound on the distance between what the boxes contain is the whole
 * point: it is what lets a pair be skipped without looking at it.
 */
function boxDistance(a: THREE.Box3, b: THREE.Box3): number {
  const gap = (lowA: number, highA: number, lowB: number, highB: number) =>
    Math.max(0, lowA - highB, lowB - highA);

  return Math.hypot(
    gap(a.min.x, a.max.x, b.min.x, b.max.x),
    gap(a.min.y, a.max.y, b.min.y, b.max.y),
    gap(a.min.z, a.max.z, b.min.z, b.max.z),
  );
}

/**
 * The closest two sets of triangles come.
 *
 * Every pair is a possibility, so the pairs are skipped as soon as their
 * bounding boxes are already further apart than the best found -- which on
 * real faces throws away almost all of them, because the two surfaces face
 * each other across one region and the rest is nowhere near.
 */
export function closestApproach(
  first: Triangle[],
  second: Triangle[],
): Approach | null {
  if (first.length === 0 || second.length === 0) return null;

  const boxesA = first.map(boxOf);
  const boxesB = second.map(boxOf);

  const spanB = new THREE.Box3();
  for (const box of boxesB) spanB.union(box);

  /*
   * Seeded with a plausible pair before the search starts.
   *
   * Skipping a pair needs something to compare against, so with no seed the
   * first pair examined is whatever came first -- often a far one -- and
   * nothing can be skipped until a near one turns up by chance. Starting from
   * the two triangles nearest each other's centres gives an answer close to
   * the real one immediately, and from then on almost everything is skipped.
   */
  const nearest = (boxes: THREE.Box3[], to: THREE.Vector3) => {
    let at = 0;
    let closest = Infinity;
    for (let i = 0; i < boxes.length; i += 1) {
      const distance = boxes[i].distanceToPoint(to);
      if (distance < closest) {
        closest = distance;
        at = i;
      }
    }
    return at;
  };

  const spanA = new THREE.Box3();
  for (const box of boxesA) spanA.union(box);

  let best = closestBetweenTriangles(
    first[nearest(boxesA, spanB.getCenter(new THREE.Vector3()))],
    second[nearest(boxesB, spanA.getCenter(new THREE.Vector3()))],
  );

  for (let a = 0; a < first.length; a += 1) {
    // Nothing in this triangle can beat what we have if the whole of the other
    // surface is already further away. Most of a large face is.
    if (boxDistance(boxesA[a], spanB) >= best.distance) continue;

    for (let b = 0; b < second.length; b += 1) {
      if (boxDistance(boxesA[a], boxesB[b]) >= best.distance) continue;

      const candidate = closestBetweenTriangles(first[a], second[b]);
      if (candidate.distance < best.distance) best = candidate;
    }
  }

  return best;
}
