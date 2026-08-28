import { describe, expect, it } from 'vitest';

import { FOV, frameModel, niceStep } from '@/lib/framing';
import type { BBox } from '@/lib/metadata';

/**
 * The half-angle, in degrees, between the camera's line of sight and the
 * furthest corner of the box. If this exceeds half the field of view, part of
 * the model is off screen.
 */
function worstCornerAngle(bounds: BBox, position: number[], target: number[]): number {
  const axis = [target[0] - position[0], target[1] - position[1], target[2] - position[2]];
  const axisLength = Math.hypot(...axis);

  let worst = 0;
  for (const x of [bounds[0][0], bounds[1][0]]) {
    for (const y of [bounds[0][1], bounds[1][1]]) {
      for (const z of [bounds[0][2], bounds[1][2]]) {
        const corner = [x - position[0], y - position[1], z - position[2]];
        const length = Math.hypot(...corner);
        if (length === 0) continue;
        const dot = corner[0] * axis[0] + corner[1] * axis[1] + corner[2] * axis[2];
        const angle = (Math.acos(dot / (length * axisLength)) * 180) / Math.PI;
        worst = Math.max(worst, angle);
      }
    }
  }
  return worst;
}

/**
 * The model that exposed this: eighteen parts spanning four millimetres, a
 * metre and a half from the origin. It loaded, the assembly tree filled in,
 * and the viewport showed nothing but grid.
 */
const FAR_FROM_ORIGIN: BBox = [
  [667.092, 862.373, 1268.36],
  [671.092, 865.873, 1272.36],
];

const NEAR_ORIGIN: BBox = [
  [-20, -15, 0],
  [60, 40, 35],
];

const LARGE: BBox = [
  [-2000, -1500, 0],
  [2000, 1500, 900],
];

describe('frameModel', () => {
  it.each([
    ['far from the origin', FAR_FROM_ORIGIN],
    ['near the origin', NEAR_ORIGIN],
    ['metres across', LARGE],
  ])('puts every corner of a model %s inside the field of view', (_label, bounds) => {
    const view = frameModel(bounds);
    expect(worstCornerAngle(bounds, view.position, view.target)).toBeLessThan(FOV / 2);
  });

  it('fills the frame rather than merely containing the model', () => {
    // A camera a mile back would satisfy the test above and show a speck.
    const view = frameModel(FAR_FROM_ORIGIN);
    expect(worstCornerAngle(FAR_FROM_ORIGIN, view.position, view.target)).toBeGreaterThan(FOV / 4);
  });

  it('aims at the centre of the model', () => {
    expect(frameModel(NEAR_ORIGIN).target).toEqual([20, 12.5, 17.5]);
  });

  it('rests the ground plane on the underside of the model', () => {
    expect(frameModel(FAR_FROM_ORIGIN).ground[2]).toBe(1268.36);
  });

  it('keeps the clipping planes around the model at every scale', () => {
    for (const bounds of [FAR_FROM_ORIGIN, NEAR_ORIGIN, LARGE]) {
      const view = frameModel(bounds);
      const distance = Math.hypot(
        view.position[0] - view.target[0],
        view.position[1] - view.target[1],
        view.position[2] - view.target[2],
      );
      expect(view.near).toBeGreaterThan(0);
      expect(view.near).toBeLessThan(distance);
      expect(view.far).toBeGreaterThan(distance);
    }
  });

  it('draws a grid finer than the model, not coarser', () => {
    // The old fixed 10 mm grid drew a single square larger than this whole
    // assembly.
    const view = frameModel(FAR_FROM_ORIGIN);
    expect(view.cellSize).toBeLessThan(4);
    expect(frameModel(LARGE).cellSize).toBeGreaterThan(100);
  });

  it('sizes measurement marks against the model, not the millimetre', () => {
    // The complaint that prompted this: a fixed 0.6 mm marker on a 4 mm
    // assembly is a third of the part, and the reading covers what it measures.
    const small = frameModel(FAR_FROM_ORIGIN);
    const smallSpan = 4; // the shortest edge of that assembly
    expect(small.markerRadius).toBeLessThan(smallSpan / 20);

    // The same fraction has to hold at the other end of the scale.
    const large = frameModel(LARGE);
    const ratio = (view: { markerRadius: number }, bounds: BBox) =>
      view.markerRadius /
      Math.hypot(
        bounds[1][0] - bounds[0][0],
        bounds[1][1] - bounds[0][1],
        bounds[1][2] - bounds[0][2],
      );
    expect(ratio(large, LARGE)).toBeCloseTo(ratio(small, FAR_FROM_ORIGIN), 10);
  });

  it('keeps the rubber band dashed rather than solid at any scale', () => {
    for (const bounds of [FAR_FROM_ORIGIN, NEAR_ORIGIN, LARGE]) {
      const view = frameModel(bounds);
      expect(view.dashSize).toBeGreaterThan(0);
      expect(view.gapSize).toBeGreaterThan(0);
    }
  });

  it('survives a model with no extent', () => {
    const view = frameModel([
      [5, 5, 5],
      [5, 5, 5],
    ]);
    for (const value of [
      ...view.position,
      ...view.target,
      view.near,
      view.far,
      view.cellSize,
      view.markerRadius,
      view.dashSize,
      view.gapSize,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).not.toBe(0);
    }
    expect(view.position).not.toEqual(view.target);
  });
});

describe('niceStep', () => {
  it('rounds to something a person can count in', () => {
    expect(niceStep(0.83)).toBe(0.5);
    expect(niceStep(3)).toBe(2);
    expect(niceStep(7)).toBe(5);
    expect(niceStep(140)).toBe(100);
  });

  it('does not return zero or NaN for degenerate input', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
  });
});
