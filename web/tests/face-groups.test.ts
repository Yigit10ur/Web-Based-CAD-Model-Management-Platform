/**
 * Turning a B-rep face back into the triangles that were made from it.
 *
 * The converter writes, per part, one half-open triangle range per face, in
 * order. That mapping is what lets a face be lit up under the cursor without
 * touching the rest of the part -- and a range that is off by one draws a
 * sliver of the neighbouring face, which reads as the wrong surface being
 * selected.
 */

import { describe, expect, it } from 'vitest';

import { faceDrawRange, faceOfTriangle } from '@/lib/metadata';

/** Three faces: 2 triangles, then 4, then 1. */
const RANGES: [number, number][] = [
  [0, 2],
  [2, 6],
  [6, 7],
];

describe('the slice one face occupies', () => {
  it('is given in index units, three to a triangle', () => {
    // `setDrawRange` counts indices, not triangles. Passing triangles would
    // light up a third of the face.
    expect(faceDrawRange(RANGES, 0)).toEqual({ start: 0, count: 6 });
    expect(faceDrawRange(RANGES, 1)).toEqual({ start: 6, count: 12 });
    expect(faceDrawRange(RANGES, 2)).toEqual({ start: 18, count: 3 });
  });

  it('agrees with the triangle each face claims', () => {
    /*
     * The two directions of the same mapping: the cursor gives a triangle and
     * `faceOfTriangle` names the face, then this draws that face. If they
     * disagreed, pointing at a surface would light up a different one.
     */
    for (let triangle = 0; triangle < 7; triangle += 1) {
      const face = faceOfTriangle(RANGES, triangle);
      const range = faceDrawRange(RANGES, face);

      expect(range).not.toBeNull();
      expect(triangle * 3).toBeGreaterThanOrEqual(range!.start);
      expect(triangle * 3).toBeLessThan(range!.start + range!.count);
    }
  });

  it('has nothing to draw for a face that was not hit', () => {
    expect(faceDrawRange(RANGES, null)).toBeNull();
  });

  it('has nothing to draw for a part with no face groups', () => {
    // A mesh import carries none: there are no B-rep faces to light up.
    expect(faceDrawRange(undefined, 0)).toBeNull();
  });

  it('refuses an index the part does not have', () => {
    // Reading past the end would hand `setDrawRange` an undefined start and
    // draw the whole part in the highlight colour.
    expect(faceDrawRange(RANGES, 3)).toBeNull();
    expect(faceDrawRange(RANGES, -1)).toBeNull();
  });

  it('refuses an empty range rather than drawing nothing at an offset', () => {
    expect(faceDrawRange([[4, 4]], 0)).toBeNull();
  });
});
