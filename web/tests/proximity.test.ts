/**
 * How close two surfaces come.
 *
 * The arithmetic behind measuring between two faces that are not parallel --
 * a fin and the plate beside it, a boss and the wall it stands off from. Those
 * are usually at right angles, which is exactly the case plane-to-plane
 * arithmetic has nothing to say about.
 *
 * Every case here has an answer that can be worked out on paper, because this
 * is code whose mistakes look plausible: a number comes out either way, and
 * the wrong one is only wrong by a little.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  closestApproach,
  trianglesOf,
  closestBetweenSegments,
  closestBetweenTriangles,
  closestOnTriangle,
  type Triangle,
} from '@/lib/proximity';

const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The unit right triangle in the z = 0 plane. */
const FLAT: Triangle = [at(0, 0, 0), at(1, 0, 0), at(0, 1, 0)];

describe('the nearest point of a triangle', () => {
  it('is directly below a point above its middle', () => {
    expect(closestOnTriangle(at(0.25, 0.25, 5), FLAT).distanceTo(at(0.25, 0.25, 0))).toBeCloseTo(0, 9);
  });

  it('is the corner for a point out past the corner', () => {
    expect(closestOnTriangle(at(-3, -3, 0), FLAT).equals(at(0, 0, 0))).toBe(true);
  });

  it('is on an edge for a point out past the edge', () => {
    // Off the side of the hypotenuse, not past either of its ends.
    const point = closestOnTriangle(at(1, 1, 0), FLAT);

    expect(point.x).toBeCloseTo(0.5, 9);
    expect(point.y).toBeCloseTo(0.5, 9);
  });

  it('is the point itself when it is already on the triangle', () => {
    expect(closestOnTriangle(at(0.2, 0.2, 0), FLAT).distanceTo(at(0.2, 0.2, 0))).toBeCloseTo(0, 9);
  });
});

describe('the nearest points of two segments', () => {
  it('finds two that cross in mid-air without touching', () => {
    // One along x at z=0, one along y at z=4. Neither endpoint is involved,
    // which is the case that vertex-only arithmetic gets wrong.
    const { distance, on, to } = closestBetweenSegments(
      at(-5, 0, 0), at(5, 0, 0),
      at(0, -5, 4), at(0, 5, 4),
    );

    expect(distance).toBeCloseTo(4, 9);
    expect(on.distanceTo(at(0, 0, 0))).toBeCloseTo(0, 9);
    expect(to.distanceTo(at(0, 0, 4))).toBeCloseTo(0, 9);
  });

  it('clamps to the ends when the crossing is off the segment', () => {
    const { distance } = closestBetweenSegments(
      at(0, 0, 0), at(1, 0, 0),
      at(10, 0, 0), at(11, 0, 0),
    );

    expect(distance).toBeCloseTo(9, 9);
  });

  it('handles two parallel segments', () => {
    // No unique answer along their length; the distance still has one.
    const { distance } = closestBetweenSegments(
      at(0, 0, 0), at(10, 0, 0),
      at(0, 3, 0), at(10, 3, 0),
    );

    expect(distance).toBeCloseTo(3, 9);
  });

  it('handles a segment that is really a point', () => {
    const { distance } = closestBetweenSegments(
      at(0, 0, 0), at(0, 0, 0),
      at(0, 7, 0), at(0, 7, 0),
    );

    expect(distance).toBeCloseTo(7, 9);
  });
});

describe('two triangles', () => {
  it('measures a corner against a face', () => {
    const above: Triangle = [at(0.25, 0.25, 3), at(0.5, 0.25, 3), at(0.25, 0.5, 3)];

    expect(closestBetweenTriangles(FLAT, above).distance).toBeCloseTo(3, 9);
  });

  it('measures two edges crossing with no corner involved', () => {
    /*
     * The case that separates this from checking corners only. Two long thin
     * triangles crossing like an X, one 2 above the other: the nearest pair is
     * mid-edge on both.
     */
    const along: Triangle = [at(-9, 0, 0), at(9, 0, 0), at(-9, 0.001, 0)];
    const across: Triangle = [at(0, -9, 2), at(0, 9, 2), at(0.001, -9, 2)];

    expect(closestBetweenTriangles(along, across).distance).toBeCloseTo(2, 3);
  });

  it('is zero for triangles that touch', () => {
    const touching: Triangle = [at(0, 0, 0), at(-1, 0, 0), at(0, -1, 0)];

    expect(closestBetweenTriangles(FLAT, touching).distance).toBeCloseTo(0, 9);
  });
});

describe('two surfaces', () => {
  /** A square in the z = 0 plane, from (0,0) to (s,s), as two triangles. */
  const square = (s: number, z: number): Triangle[] => [
    [at(0, 0, z), at(s, 0, z), at(s, s, z)],
    [at(0, 0, z), at(s, s, z), at(0, s, z)],
  ];

  it('measures the gap between two parallel squares', () => {
    const approach = closestApproach(square(10, 0), square(10, 4));

    expect(approach?.distance).toBeCloseTo(4, 9);
  });

  it('measures between two squares at right angles that do not touch', () => {
    /*
     * The reported case: a face and another at 90° to it, standing off with a
     * real gap between them. Plane-to-plane arithmetic answers "they meet",
     * because the planes do -- the faces do not.
     */
    const upright: Triangle[] = [
      [at(0, 0, 6), at(0, 10, 6), at(0, 10, 16)],
      [at(0, 0, 6), at(0, 10, 16), at(0, 0, 16)],
    ];

    const approach = closestApproach(square(10, 0), upright);

    expect(approach?.distance).toBeCloseTo(6, 9);
  });

  it('says where the two surfaces are closest, not just how close', () => {
    // The line drawn has to join the two points it measured between.
    const approach = closestApproach(square(10, 0), square(10, 4));

    expect(approach).not.toBeNull();
    expect(approach!.on.distanceTo(approach!.to)).toBeCloseTo(approach!.distance, 9);
    expect(approach!.on.z).toBeCloseTo(0, 9);
    expect(approach!.to.z).toBeCloseTo(4, 9);
  });

  it('is zero for surfaces that share an edge', () => {
    const upright: Triangle[] = [
      [at(0, 0, 0), at(0, 10, 0), at(0, 10, 10)],
      [at(0, 0, 0), at(0, 10, 10), at(0, 0, 10)],
    ];

    expect(closestApproach(square(10, 0), upright)?.distance).toBeCloseTo(0, 9);
  });

  it('finds the closest pair even when it is not the first pair looked at', () => {
    /*
     * The pairs are skipped once their bounding boxes are already further
     * apart than the best found, and getting that comparison backwards throws
     * away exactly the pairs worth looking at. It is invisible unless the
     * first pair examined is the wrong one -- so here the first triangle of
     * each surface is far away and the second is close.
     */
    const spread: Triangle[] = [
      [at(100, 100, 0), at(110, 100, 0), at(110, 110, 0)],
      [at(0, 0, 0), at(1, 0, 0), at(1, 1, 0)],
    ];
    const near: Triangle[] = [
      [at(100, 100, 50), at(110, 100, 50), at(110, 110, 50)],
      [at(0, 0, 2), at(1, 0, 2), at(1, 1, 2)],
    ];

    expect(closestApproach(spread, near)?.distance).toBeCloseTo(2, 9);
  });

  it('agrees with looking at every pair, on shapes it cannot have been tuned to', () => {
    /*
     * The search skips pairs whose bounding boxes are already further apart
     * than the best found. That is only sound if the bound is a bound -- and a
     * culling bug does not throw, it quietly answers a little too large.
     *
     * So: random surfaces, and the same question asked the slow way.
     */
    let seed = 12345;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const point = () => at(random() * 20 - 10, random() * 20 - 10, random() * 20 - 10);

    for (let round = 0; round < 25; round += 1) {
      const a: Triangle[] = Array.from({ length: 8 }, () => [point(), point(), point()]);
      const b: Triangle[] = Array.from({ length: 8 }, () => [point(), point(), point()]);

      let brute = Infinity;
      for (const first of a)
        for (const second of b)
          brute = Math.min(brute, closestBetweenTriangles(first, second).distance);

      expect(closestApproach(a, b)?.distance, `round ${round}`).toBeCloseTo(brute, 9);
    }
  });

  it('does not stop at the first good answer it finds', () => {
    /*
     * Built so that the seeded guess and the first pair examined are both
     * wrong, and the true answer is in a pair that any over-eager skipping
     * throws away.
     *
     * Two triangles per surface: one pair 10 apart at one end, one pair 7
     * apart a hundred millimetres away. The answer is 7, and a search that
     * tightens its skipping too far settles for 10 -- which is a plausible
     * number, wrong, and impossible to notice on screen.
     */
    const a: Triangle[] = [
      [at(0, 0, 0), at(1, 0, 0), at(0, 1, 0)],
      [at(100, 0, 0), at(101, 0, 0), at(100, 1, 0)],
    ];
    const b: Triangle[] = [
      [at(0, 0, 10), at(1, 0, 10), at(0, 1, 10)],
      [at(100, 0, 7), at(101, 0, 7), at(100, 1, 7)],
    ];

    expect(closestApproach(a, b)?.distance).toBeCloseTo(7, 9);
  });

  it('has no answer for a surface with no triangles', () => {
    expect(closestApproach([], square(10, 0))).toBeNull();
  });

  it('gives the same answer whichever way round it is asked', () => {
    const a = square(10, 0);
    const b = square(10, 4);

    expect(closestApproach(a, b)?.distance).toBeCloseTo(
      closestApproach(b, a)?.distance ?? NaN,
      9,
    );
  });
});

describe('reading a face out of the geometry', () => {
  /** Two triangles' worth of positions, unindexed. */
  const geometry = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([
          0, 0, 0, 1, 0, 0, 0, 1, 0,
          5, 5, 5, 6, 5, 5, 5, 6, 5,
        ]),
        3,
      ),
    );
    return g;
  };

  it('reads only the range asked for', () => {
    // The face is a slice of the part's triangles, not all of them. Reading
    // the whole part would measure against surfaces nobody picked.
    const triangles = trianglesOf(geometry(), 0, 3, at(0, 0, 0));

    expect(triangles).toHaveLength(1);
    expect(triangles[0][0].equals(at(0, 0, 0))).toBe(true);
  });

  it('reads the second face when asked for the second range', () => {
    const triangles = trianglesOf(geometry(), 3, 3, at(0, 0, 0));

    expect(triangles[0][0].equals(at(5, 5, 5))).toBe(true);
  });

  it('moves the triangles to where the part is drawn', () => {
    /*
     * An exploded part is drawn away from where its data says it is, and a
     * measurement between two parts that have been pushed apart has to be
     * taken where they are on screen. Without this the gap between two
     * exploded parts reads as their unexploded gap.
     */
    const triangles = trianglesOf(geometry(), 0, 3, at(0, 0, 20));

    expect(triangles[0][0].equals(at(0, 0, 20))).toBe(true);
    expect(triangles[0][1].equals(at(1, 0, 20))).toBe(true);
  });

  it('stops at the end of the buffer rather than reading past it', () => {
    // A count larger than the geometry holds would otherwise produce
    // triangles of NaN, which measure as NaN and display as nothing.
    const triangles = trianglesOf(geometry(), 0, 999, at(0, 0, 0));

    expect(triangles).toHaveLength(2);
    for (const triangle of triangles) {
      for (const corner of triangle) {
        expect(Number.isFinite(corner.x)).toBe(true);
      }
    }
  });
});
