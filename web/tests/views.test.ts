/**
 * The standard views.
 *
 * Written because the axis gizmo's own version was wrong in a way that only
 * shows on real data: drei moves the camera by the distance from it to the
 * world *origin*, not to what is being looked at. A CAD assembly sitting a
 * metre and a half from the origin therefore sent the camera a metre and a
 * half past it, and the screen went blank. These tests are about the model
 * being somewhere other than the origin.
 */

import { describe, expect, it } from 'vitest';

import type { Vec3 } from '@/lib/metadata';
import { cameraFor, STANDARD_VIEWS, viewByName, type ViewName } from '@/lib/views';

/** Deliberately nowhere near the origin, which is the whole point. */
const TARGET: Vec3 = [667, 862, 1268];

const distanceBetween = (a: Vec3, b: Vec3) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('placing the camera', () => {
  it.each(STANDARD_VIEWS.map((view) => view.name))(
    'keeps the distance it was already at, for %s',
    (name) => {
      // The bug this file exists for: a camera 40 mm from a part, asked for a
      // named view, ending up 1.7 m away because that is how far the part is
      // from the origin.
      const { position } = cameraFor(viewByName(name), TARGET, 40);

      expect(distanceBetween(position, TARGET)).toBeCloseTo(40, 9);
    },
  );

  it('puts the camera on the far side of the model, not inside it', () => {
    // Front means looking from -Y towards the model, which puts the camera at
    // a smaller Y than the model. The sign being wrong would leave the camera
    // inside the assembly, which also renders as nothing.
    const { position } = cameraFor(viewByName('front'), TARGET, 40);

    expect(position[1]).toBeLessThan(TARGET[1]);
    expect(position[0]).toBeCloseTo(TARGET[0], 9);
    expect(position[2]).toBeCloseTo(TARGET[2], 9);
  });

  it('puts top above and bottom below', () => {
    expect(cameraFor(viewByName('top'), TARGET, 40).position[2]).toBeGreaterThan(TARGET[2]);
    expect(cameraFor(viewByName('bottom'), TARGET, 40).position[2]).toBeLessThan(TARGET[2]);
  });

  it('survives a distance of zero rather than collapsing onto the model', () => {
    // Reachable: the orbit target and the camera coincide for a moment after
    // some sequences, and a zero-length view direction is a camera with no
    // orientation at all.
    const { position } = cameraFor(viewByName('front'), TARGET, 0);

    expect(distanceBetween(position, TARGET)).toBeGreaterThan(0);
  });
});

describe('which way is up', () => {
  it('never points up along the direction it is looking', () => {
    /*
     * The one thing a view definition can get wrong that produces no error and
     * no picture. Looking straight down with Z also up leaves the camera with
     * no orientation to take.
     */
    for (const view of STANDARD_VIEWS) {
      const dot =
        view.direction[0] * view.up[0] +
        view.direction[1] * view.up[1] +
        view.direction[2] * view.up[2];

      expect(Math.abs(dot)).toBeLessThan(0.999);
    }
  });

  it('keeps Z up for every view that can', () => {
    // CAD data is Z-up and so is this viewer; only looking straight along Z
    // is a reason to depart from it.
    for (const view of STANDARD_VIEWS) {
      if (view.name === 'top' || view.name === 'bottom') continue;
      expect(view.up).toEqual([0, 0, 1]);
    }
  });

  it('has unit directions', () => {
    // A direction shorter than one would quietly scale every distance the
    // views are placed at.
    for (const view of STANDARD_VIEWS) {
      expect(Math.hypot(...view.direction)).toBeCloseTo(1, 9);
    }
  });
});

describe('looking a view up', () => {
  it('refuses a name it does not have', () => {
    expect(() => viewByName('sideways' as ViewName)).toThrow();
  });
});
