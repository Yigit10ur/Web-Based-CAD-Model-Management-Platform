/**
 * The section plane.
 *
 * The slider is stored as 0..1 across the model's bounding box rather than as a
 * world coordinate, which is what lets one control behave the same on a 4 mm
 * part and a 4 m assembly. These tests pin the two ends of that translation.
 */

import { describe, expect, it } from 'vitest';

import type { BBox } from '@/lib/metadata';
import { sectionPlane, type SectionAxis } from '@/lib/section';

/** Where the plane actually cuts, on its own axis. */
function cutAt(axis: SectionAxis, position: number, bounds: BBox): number {
  const plane = sectionPlane(axis, position, false, bounds);
  // The plane is stored with the normal pointing back down the axis, so the
  // coordinate it cuts at is the constant with that sign undone.
  return -plane.constant / plane.normal.getComponent({ x: 0, y: 1, z: 2 }[axis]);
}

// Deliberately not centred on the origin, and not the same size on each axis:
// a bug that assumed either would pass against a tidier box.
const BOUNDS: BBox = [
  [10, -40, 667],
  [50, 40, 671],
];

describe('sectionPlane', () => {
  it.each<[SectionAxis, number]>([
    ['x', 30],
    ['y', 0],
    ['z', 669],
  ])('cuts %s through the middle of the model at 0.5', (axis, middle) => {
    // The `centre` button sets exactly this, so the midpoint has to be exact
    // rather than nearly right. It is only exact because the margin the plane
    // adds at the extremes is the same on both ends and cancels here; a
    // one-sided margin would silently move the middle.
    expect(cutAt(axis, 0.5, BOUNDS)).toBeCloseTo(middle, 9);
  });

  it('clears the model at either end of the travel', () => {
    // Otherwise taking the slider fully to one side would still shave a sliver
    // off the model, which reads as a bug rather than as "off".
    expect(cutAt('x', 0, BOUNDS)).toBeLessThan(10);
    expect(cutAt('x', 1, BOUNDS)).toBeGreaterThan(50);
  });

  it('keeps opposite halves when flipped', () => {
    const near = sectionPlane('x', 0.5, false, BOUNDS);
    const far = sectionPlane('x', 0.5, true, BOUNDS);

    expect(far.normal.x).toBe(-near.normal.x);
    expect(far.constant).toBe(-near.constant);
  });
});
