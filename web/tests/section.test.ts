/**
 * The section plane.
 *
 * The plane is stored as a direction plus a 0..1 position across the model
 * rather than as a world coordinate, which is what lets one control behave the
 * same on a 4 mm part and a 4 m assembly. These tests pin both ends of that
 * translation, and the arbitrary directions that were added when a cut stopped
 * having to follow an axis.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import type { BBox, Vec3 } from '@/lib/metadata';
import type { FaceGeometry } from '@/lib/metadata';
import {
  cutDistance,
  faceReference,
  describeNormal,
  extentAlong,
  positionOfPoint,
  sectionNormal,
  sectionPlane,
  type SectionPlacement,
  type SectionReference,
} from '@/lib/section';

/** A placement with everything at rest except what a test is interested in. */
function place(patch: Partial<SectionPlacement> = {}): SectionPlacement {
  return {
    reference: 'z',
    normal: [0, 0, 1],
    position: 0.5,
    flipped: false,
    rotateX: 0,
    rotateY: 0,
    ...patch,
  };
}

/** Where the plane actually cuts, on its own axis. */
function cutAt(reference: SectionReference, position: number, bounds: BBox): number {
  const plane = sectionPlane(place({ reference, position }), bounds);
  // The plane is stored with the normal pointing back down the axis, so the
  // coordinate it cuts at is the constant with that sign undone.
  const index = { x: 0, y: 1, z: 2, custom: 2 }[reference];
  return -plane.constant / plane.normal.getComponent(index);
}

// Deliberately not centred on the origin, and not the same size on each axis:
// a bug that assumed either would pass against a tidier box.
const BOUNDS: BBox = [
  [10, -40, 667],
  [50, 40, 671],
];

describe('sectionPlane', () => {
  it.each<[SectionReference, number]>([
    ['x', 30],
    ['y', 0],
    ['z', 669],
  ])('cuts %s through the middle of the model at 0.5', (reference, middle) => {
    // The `centre` button sets exactly this, so the midpoint has to be exact
    // rather than nearly right. It is only exact because the margin the plane
    // adds at the extremes is the same on both ends and cancels here; a
    // one-sided margin would silently move the middle.
    expect(cutAt(reference, 0.5, BOUNDS)).toBeCloseTo(middle, 9);
  });

  it('clears the model at either end of the travel', () => {
    // Otherwise taking the slider fully to one side would still shave a sliver
    // off the model, which reads as a bug rather than as "off".
    expect(cutAt('x', 0, BOUNDS)).toBeLessThan(10);
    expect(cutAt('x', 1, BOUNDS)).toBeGreaterThan(50);
  });

  it('keeps opposite halves when flipped', () => {
    const near = sectionPlane(place({ reference: 'x' }), BOUNDS);
    const far = sectionPlane(place({ reference: 'x', flipped: true }), BOUNDS);

    expect(far.normal.x).toBe(-near.normal.x);
    expect(far.constant).toBe(-near.constant);
  });
});

describe('a direction borrowed from a face', () => {
  it('is normalised, so a face normal that is not unit length still cuts once', () => {
    // Nothing promises the converter's normals are unit length, and a
    // half-length one would halve every distance derived from it.
    const normal = sectionNormal(place({ reference: 'custom', normal: [0, 0, 5] }));

    expect(normal.length()).toBeCloseTo(1, 12);
    expect(normal.z).toBeCloseTo(1, 12);
  });

  it('falls back rather than producing a plane with no direction', () => {
    // A zero normal would make a degenerate plane, and what a degenerate plane
    // clips is up to the driver: everything on one machine, nothing on the
    // next.
    const normal = sectionNormal(place({ reference: 'custom', normal: [0, 0, 0] }));

    expect(normal.length()).toBeCloseTo(1, 12);
  });

  it('reproduces the named axes exactly when handed their directions', () => {
    // The three buttons have to stay a special case of the general path rather
    // than a second one that can drift away from it.
    for (const [reference, vector] of [
      ['x', [1, 0, 0]],
      ['y', [0, 1, 0]],
      ['z', [0, 0, 1]],
    ] as [SectionReference, Vec3][]) {
      const named = sectionPlane(place({ reference }), BOUNDS);
      const borrowed = sectionPlane(place({ reference: 'custom', normal: vector }), BOUNDS);

      expect(borrowed.normal.toArray()).toEqual(named.normal.toArray());
      expect(borrowed.constant).toBeCloseTo(named.constant, 9);
    }
  });
});

describe('extentAlong', () => {
  it('measures a diagonal direction across the whole box', () => {
    // The eight corners projected onto the direction, without projecting eight
    // corners. A bug here shows up as a slider whose ends do not clear the
    // model.
    // Mixed signs on purpose: the half-extents are added as magnitudes, and a
    // direction with every component positive cannot tell that apart from
    // adding them signed.
    const direction = new THREE.Vector3(2, -3, 1).normalize();
    const [low, high] = extentAlong(direction, BOUNDS);

    const corners: Vec3[] = [];
    for (const x of [BOUNDS[0][0], BOUNDS[1][0]])
      for (const y of [BOUNDS[0][1], BOUNDS[1][1]])
        for (const z of [BOUNDS[0][2], BOUNDS[1][2]]) corners.push([x, y, z]);

    const projected = corners.map((corner) =>
      new THREE.Vector3(...corner).dot(direction),
    );

    expect(low).toBeCloseTo(Math.min(...projected), 9);
    expect(high).toBeCloseTo(Math.max(...projected), 9);
  });
});

describe('rotating away from the reference', () => {
  it('leaves the direction alone at zero', () => {
    const normal = sectionNormal(place({ reference: 'z', rotateX: 0, rotateY: 0 }));

    expect(normal.toArray()).toEqual([0, 0, 1]);
  });

  it('turns Z into a horizontal direction at 90 degrees', () => {
    const normal = sectionNormal(place({ reference: 'z', rotateX: 90 }));

    // Which horizontal direction depends on the axis chosen inside, and that
    // is deliberately not pinned -- what matters is that it left Z entirely.
    expect(normal.z).toBeCloseTo(0, 9);
    expect(normal.length()).toBeCloseTo(1, 12);
  });

  it('keeps the direction a unit vector at every angle', () => {
    // Two sequential rotations are where a normalise gets forgotten, and a
    // direction that is 0.99 long shifts every cut it takes part in.
    for (let x = -90; x <= 90; x += 15) {
      for (let y = -90; y <= 90; y += 15) {
        const normal = sectionNormal(place({ rotateX: x, rotateY: y }));
        expect(normal.length()).toBeCloseTo(1, 12);
      }
    }
  });

  it('turns by the angle the dial says, not merely by some angle', () => {
    // The dial is labelled in degrees, so 30 has to mean 30 away from the
    // reference. Nothing else in the code checks that the axis it rotates
    // about is perpendicular to the direction it rotates -- and if it were
    // not, the angle would come out smaller than the number on the dial.
    const references: [SectionReference, Vec3][] = [
      ['z', [0, 0, 1]],
      // X and a diagonal are the cases that matter: a rotation axis taken from
      // the world rather than from the plane is parallel to one of these, and
      // rotating a direction about itself moves it nowhere.
      ['x', [1, 0, 0]],
      ['custom', [1, 2, 3]],
    ];

    for (const [reference, vector] of references) {
      const base = new THREE.Vector3(...vector).normalize();

      for (const angle of [5, 30, 45, 90, -60]) {
        const turned = sectionNormal(place({ reference, normal: vector, rotateX: angle }));
        expect((turned.angleTo(base) * 180) / Math.PI).toBeCloseTo(Math.abs(angle), 9);

        const both = sectionNormal(place({ reference, normal: vector, rotateY: angle }));
        expect((both.angleTo(base) * 180) / Math.PI).toBeCloseTo(Math.abs(angle), 9);
      }
    }
  });

  it('gives two dials rather than one dial twice', () => {
    // Both rotations turning about the same axis would add up instead of
    // spanning, leaving whole directions unreachable -- and every test that
    // moves one dial at a time would still pass.
    const first = sectionNormal(place({ reference: 'z', rotateX: 40 }));
    const second = sectionNormal(place({ reference: 'z', rotateY: 40 }));

    expect(first.angleTo(second)).toBeGreaterThan(0.1);

    // And together they reach somewhere neither reaches alone.
    const both = sectionNormal(place({ reference: 'z', rotateX: 40, rotateY: 40 }));
    expect(both.angleTo(first)).toBeGreaterThan(0.1);
    expect(both.angleTo(second)).toBeGreaterThan(0.1);
  });

  it('comes back exactly when the dials return to zero', () => {
    // This is the reversibility a user actually relies on: the reference is
    // fixed and the dials measure from it, so zero is the reference itself and
    // not merely near it.
    const reference = sectionNormal(place({ reference: 'x' }));
    const wandered = place({ reference: 'x', rotateX: 40, rotateY: -25 });
    const home = sectionNormal({ ...wandered, rotateX: 0, rotateY: 0 });

    expect(home.toArray()).toEqual(reference.toArray());
  });
});

describe('picking a face', () => {
  it('puts the cut on the point that was clicked', () => {
    // This is the whole promise of picking a face: the plane lands on it, not
    // near it. positionOfPoint has to be the exact inverse of cutDistance or
    // the cut appears a fraction of the model away from the face it was taken
    // from.
    const placement = place({ reference: 'custom', normal: [0, 1, 0] });
    const clicked = new THREE.Vector3(30, 12.5, 669);

    const position = positionOfPoint(clicked, placement, BOUNDS);
    const at = cutDistance({ ...placement, position }, BOUNDS);

    expect(at).toBeCloseTo(12.5, 9);
  });

  it('round-trips a point on a tilted plane too', () => {
    const placement = place({ reference: 'custom', normal: [1, 2, 3], rotateX: 20, rotateY: -35 });
    const clicked = new THREE.Vector3(22, 7, 668);
    const expected = clicked.dot(sectionNormal(placement));

    const position = positionOfPoint(clicked, placement, BOUNDS);

    expect(cutDistance({ ...placement, position }, BOUNDS)).toBeCloseTo(expected, 9);
  });

  it('clamps a point outside the model onto the travel', () => {
    // An exploded part can be clicked well outside the assembly's own box, and
    // a slider value above 1 would leave the control unable to show where the
    // plane is.
    const placement = place({ reference: 'custom', normal: [0, 0, 1] });

    expect(positionOfPoint(new THREE.Vector3(0, 0, 9999), placement, BOUNDS)).toBe(1);
    expect(positionOfPoint(new THREE.Vector3(0, 0, -9999), placement, BOUNDS)).toBe(0);
  });
});

describe('describeNormal', () => {
  it('names the axis while the cut is still on one', () => {
    expect(describeNormal(place({ reference: 'y' }))).toBe('Y');
  });

  it('gives the numbers once it is not', () => {
    // A tilted cut down a named axis is no longer that axis, and calling it
    // one would be the panel lying about where the plane is.
    expect(describeNormal(place({ reference: 'z', rotateX: 45 }))).toContain(',');
    expect(describeNormal(place({ reference: 'custom', normal: [1, 0, 0] }))).toContain(',');
  });
});

describe('borrowing a direction from a clicked face', () => {
  const plane = (normal: Vec3): FaceGeometry => ({
    kind: 'plane',
    normal,
    axis: null,
    radius: null,
  });

  it('takes the face normal and puts the cut on the click', () => {
    const face = plane([0, 1, 0]);
    const clicked = new THREE.Vector3(30, 12.5, 669);

    const result = faceReference(face, clicked, BOUNDS);

    expect(result.taken).toBe(true);
    if (!result.taken) return;

    expect(result.normal).toEqual([0, 1, 0]);
    // The whole promise of picking a face: the plane lands on it, not near it.
    const placement = place({ reference: 'custom', normal: result.normal, position: result.position });
    expect(cutDistance(placement, BOUNDS)).toBeCloseTo(12.5, 9);
  });

  it('refuses a curved face, and says which kind it was', () => {
    // Silence would leave someone clicking a cylinder over and over. Naming
    // the kind is what tells them it is the face, not the click.
    const result = faceReference(
      { kind: 'cylinder', normal: null, axis: [0, 0, 1], radius: 5 },
      new THREE.Vector3(0, 0, 0),
      BOUNDS,
    );

    expect(result.taken).toBe(false);
    if (result.taken) return;
    expect(result.reason).toContain('cylinder');
  });

  it('refuses a curved face even when one carries a normal', () => {
    // The rule is the kind of surface, not whether a normal happens to be
    // filled in. A cone's normal at one point says nothing about the rest of
    // it, and a cut taken from it would be square to nothing.
    const result = faceReference(
      { kind: 'cone', normal: [0, 0, 1], axis: [0, 0, 1], radius: 3 },
      new THREE.Vector3(0, 0, 0),
      BOUNDS,
    );

    expect(result.taken).toBe(false);
  });

  it('refuses a face the metadata does not have', () => {
    // A triangle outside every face range, or a part with no snap data at
    // all: reading `undefined.kind` here would take the viewer down.
    const result = faceReference(undefined, new THREE.Vector3(0, 0, 0), BOUNDS);

    expect(result.taken).toBe(false);
  });

  it('refuses a plane whose normal never made it into the file', () => {
    const result = faceReference(
      { kind: 'plane', normal: null, axis: null, radius: null },
      new THREE.Vector3(0, 0, 0),
      BOUNDS,
    );

    expect(result.taken).toBe(false);
  });
});
