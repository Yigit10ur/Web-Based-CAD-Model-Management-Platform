/**
 * What two picks mean.
 *
 * The reason this file exists: measuring between two flat faces by the two
 * places the cursor happened to land on them is wrong every time the clicks
 * are not opposite each other, and wrong in a way that looks entirely
 * plausible -- a plate 10 mm thick reading 14.2 mm because the second click
 * was 10 mm along the face.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import type { FaceGeometry, Vec3 } from '@/lib/metadata';
import { formatIn, formatMeasurement, measure, measureInMode } from '@/lib/measure';
import type { SnapTarget } from '@/lib/snap';

function plane(normal: Vec3): FaceGeometry {
  return { kind: 'plane', normal, axis: null, radius: null };
}

function onFace(point: Vec3, normal: Vec3): SnapTarget {
  return {
    point: new THREE.Vector3(...point),
    kind: 'face',
    partId: 'n1_1',
    index: 0,
    label: 'plane',
    face: plane(normal),
  };
}

function corner(point: Vec3): SnapTarget {
  return {
    point: new THREE.Vector3(...point),
    kind: 'vertex',
    partId: 'n1_1',
    index: null,
    label: 'corner',
  };
}

describe('two flat faces facing each other', () => {
  it('measures across the gap, not between the two clicks', () => {
    // A 10 mm plate, clicked once on each side but 30 mm apart along the face.
    // Point to point would read 31.6 mm and look perfectly reasonable.
    const result = measure(onFace([0, 0, 0], [0, 0, 1]), onFace([30, 0, 10], [0, 0, -1]));

    expect(result.kind).toBe('gap');
    expect(result.value).toBeCloseTo(10, 9);
  });

  it('draws the line along the perpendicular', () => {
    // The number being right is not enough: a line running diagonally across
    // the gap is longer than the gap and reads as the wrong measurement even
    // with the right label beside it.
    const result = measure(onFace([0, 0, 0], [0, 0, 1]), onFace([30, 0, 10], [0, 0, -1]));

    expect(result.from.distanceTo(result.to)).toBeCloseTo(10, 9);
    expect(result.to.x).toBeCloseTo(0, 9);
    expect(result.to.z).toBeCloseTo(10, 9);
  });

  it('is never negative, whichever face was picked first', () => {
    /*
     * Both normals the same way and the second face *behind* the first, which
     * is the only arrangement where the signed separation comes out negative.
     * Two faces looking at each other cannot produce it however they are
     * ordered, so a test built from those would not notice a missing abs -- an
     * earlier version of this one did not.
     */
    const front = onFace([0, 0, 4], [0, 0, 1]);
    const behind = onFace([0, 0, 0], [0, 0, 1]);

    expect(measure(front, behind).value).toBeCloseTo(4, 9);
    expect(measure(behind, front).value).toBeCloseTo(4, 9);
  });

  it('reads zero for two picks on the same face', () => {
    // Both clicks on one surface. Zero is the honest answer, and the line
    // collapses rather than drawing something across the part.
    const result = measure(onFace([0, 0, 5], [0, 0, 1]), onFace([40, 20, 5], [0, 0, 1]));

    expect(result.kind).toBe('gap');
    expect(result.value).toBeCloseTo(0, 9);
  });

  it('handles faces pointing the same way, not just towards each other', () => {
    // Two steps of a machined face: both normals up, 4 mm apart.
    const result = measure(onFace([0, 0, 0], [0, 0, 1]), onFace([10, 10, 4], [0, 0, 1]));

    expect(result.value).toBeCloseTo(4, 9);
  });
});

describe('two flat faces that meet', () => {
  it('answers with the angle, because the distance is not a number', () => {
    // They intersect: the distance between them is zero somewhere and
    // whatever you like elsewhere.
    const result = measure(onFace([0, 0, 0], [0, 0, 1]), onFace([5, 0, 0], [1, 0, 0]));

    expect(result.kind).toBe('angle');
    expect(result.unit).toBe('°');
    expect(result.value).toBeCloseTo(90, 9);
  });

  it('gives the angle between the surfaces, not its supplement', () => {
    // Two faces 30° apart are dimensioned as 30°, not 150°.
    const result = measure(
      onFace([0, 0, 0], [0, 0, 1]),
      onFace([0, 0, 0], [Math.sin(Math.PI / 6), 0, -Math.cos(Math.PI / 6)]),
    );

    expect(result.value).toBeCloseTo(30, 6);
  });
});

describe('anything else', () => {
  it('measures corner to corner as a length', () => {
    const result = measure(corner([0, 0, 0]), corner([3, 4, 0]));

    expect(result.kind).toBe('length');
    expect(result.value).toBeCloseTo(5, 9);
  });

  it('falls back to a length when only one pick is a face', () => {
    const result = measure(corner([0, 0, 0]), onFace([0, 0, 7], [0, 0, 1]));

    expect(result.kind).toBe('length');
    expect(result.value).toBeCloseTo(7, 9);
  });

  it('refuses to treat a curved face as a plane', () => {
    /*
     * A cylinder's normal changes at every point on it, and the metadata does
     * not say where its axis is. There is nothing here to be exact with, and
     * this application does not offer a measurement it cannot stand behind.
     */
    const curved = (face: FaceGeometry): SnapTarget => ({
      point: new THREE.Vector3(0, 0, 10),
      kind: 'face',
      partId: 'n1_1',
      index: 1,
      label: face.kind,
      face,
    });

    const flat = onFace([0, 0, 0], [0, 0, 1]);

    expect(measure(flat, curved({ kind: 'cylinder', normal: null, axis: [0, 0, 1], radius: 5 })).kind).toBe('length');

    /*
     * And one that carries a normal anyway. The rule is the kind of surface,
     * not whether the field happens to be filled in: a cone's normal at one
     * point says nothing about the rest of it, and a gap measured from it
     * would be square to nothing.
     */
    expect(measure(flat, curved({ kind: 'cone', normal: [0, 0, 1], axis: [0, 0, 1], radius: 3 })).kind).toBe('length');
    expect(measure(flat, curved({ kind: 'sphere', normal: [0, 0, 1], axis: null, radius: 3 })).kind).toBe('length');
  });

  it('falls back when a plane arrived without a normal', () => {
    const noNormal: SnapTarget = {
      ...onFace([0, 0, 4], [0, 0, 1]),
      face: { kind: 'plane', normal: null, axis: null, radius: null },
    };

    expect(measure(onFace([0, 0, 0], [0, 0, 1]), noNormal).kind).toBe('length');
  });
});

describe('how a reading is written', () => {
  it('gives millimetres two decimals and degrees one', () => {
    expect(formatMeasurement(10.005, 'mm')).toBe('10.01 mm');
    expect(formatMeasurement(30.04, '°')).toBe('30.0°');
  });
});

describe('measuring in a chosen mode', () => {
  const circle = (centre: Vec3, radius: number, at: Vec3): SnapTarget => ({
    point: new THREE.Vector3(...at),
    kind: 'edge',
    partId: 'n1_1',
    index: 0,
    label: 'circle',
    edge: {
      kind: 'circle',
      start: at,
      end: at,
      length: 2 * Math.PI * radius,
      centre,
      axis: [0, 0, 1],
      radius,
    },
  });

  const line = (from: Vec3, to: Vec3): SnapTarget => ({
    point: new THREE.Vector3(...from),
    kind: 'edge',
    partId: 'n1_1',
    index: 1,
    label: 'edge',
    edge: {
      kind: 'line',
      start: from,
      end: to,
      length: Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]),
      centre: null,
      axis: null,
      radius: null,
    },
  });

  it('reads the length off the edge, not off the two ends of a click', () => {
    const outcome = measureInMode('edge-length', line([0, 0, 0], [30, 40, 0]));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.value).toBeCloseTo(50, 9);
  });

  it('gives a circle its circumference under length', () => {
    // A circular edge has a length, and it is not the distance between its
    // ends -- those are the same point.
    const outcome = measureInMode('edge-length', circle([0, 0, 0], 4, [4, 0, 0]));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.value).toBeCloseTo(2 * Math.PI * 4, 6);
  });

  it('reads radius and diameter off the circle itself', () => {
    const radius = measureInMode('edge-radius', circle([0, 0, 0], 4, [4, 0, 0]));
    const diameter = measureInMode('edge-diameter', circle([0, 0, 0], 4, [4, 0, 0]));

    expect(radius.ok && radius.result.value).toBeCloseTo(4, 9);
    expect(diameter.ok && diameter.result.value).toBeCloseTo(8, 9);
  });

  it('draws the radius from the centre and the diameter across it', () => {
    // The line has to be the thing it names, or the number is right and the
    // picture disagrees with it.
    const radius = measureInMode('edge-radius', circle([0, 0, 0], 4, [4, 0, 0]));
    const diameter = measureInMode('edge-diameter', circle([0, 0, 0], 4, [4, 0, 0]));

    expect(radius.ok && radius.result.from.length()).toBeCloseTo(0, 9);
    expect(radius.ok && radius.result.from.distanceTo(radius.result.to)).toBeCloseTo(4, 9);
    expect(diameter.ok && diameter.result.from.distanceTo(diameter.result.to)).toBeCloseTo(8, 9);
  });

  it('refuses a radius on a straight edge, and says why', () => {
    // Doing nothing would leave somebody clicking the same edge over and over.
    const outcome = measureInMode('edge-radius', line([0, 0, 0], [10, 0, 0]));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/circular/i);
  });

  it('refuses a face where an edge was asked for', () => {
    const outcome = measureInMode('edge-length', onFace([0, 0, 0], [0, 0, 1]));

    expect(outcome.ok).toBe(false);
  });

  it('sends parallel faces to distance and meeting faces to angle', () => {
    /*
     * The two face modes each refuse the other's case rather than answering
     * it. A distance mode that returned an angle would put a number in
     * degrees under a heading that says millimetres.
     */
    const parallel = [onFace([0, 0, 0], [0, 0, 1]), onFace([0, 0, 10], [0, 0, -1])] as const;
    const meeting = [onFace([0, 0, 0], [0, 0, 1]), onFace([0, 0, 0], [1, 0, 0])] as const;

    expect(measureInMode('face-distance', ...parallel).ok).toBe(true);
    expect(measureInMode('face-angle', ...meeting).ok).toBe(true);

    const wrongWay = measureInMode('face-distance', ...meeting);
    expect(wrongWay.ok).toBe(false);
    if (!wrongWay.ok) expect(wrongWay.reason).toMatch(/angle/i);

    const alsoWrong = measureInMode('face-angle', ...parallel);
    expect(alsoWrong.ok).toBe(false);
    if (!alsoWrong.ok) expect(alsoWrong.reason).toMatch(/distance/i);
  });

  it('refuses a corner where a face was asked for', () => {
    const outcome = measureInMode('face-distance', corner([0, 0, 0]), corner([0, 0, 5]));

    expect(outcome.ok).toBe(false);
  });

  it('measures point to point whatever was picked', () => {
    // The one mode that takes anything: it is about the two locations, not
    // about what they belong to.
    const outcome = measureInMode('point-distance', corner([0, 0, 0]), onFace([0, 0, 5], [0, 0, 1]));

    expect(outcome.ok && outcome.result.value).toBeCloseTo(5, 9);
  });
});

describe('reading a measurement in a unit', () => {
  it('converts without touching what was stored', () => {
    // Everything is measured in millimetres; a unit is a way of reading it.
    expect(formatIn(25.4, 'mm', 'mm')).toBe('25.40 mm');
    expect(formatIn(25.4, 'mm', 'cm')).toBe('2.540 cm');
    expect(formatIn(25.4, 'mm', 'in')).toBe('1.0000 in');
    expect(formatIn(1000, 'mm', 'm')).toBe('1.00000 m');
  });

  it('keeps enough places that a tenth of a millimetre survives', () => {
    // A metre shown to two places would round 0.1 mm away, and somebody would
    // read two different holes as the same size.
    for (const unit of ['mm', 'cm', 'm', 'in'] as const) {
      expect(formatIn(10, 'mm', unit)).not.toBe(formatIn(10.1, 'mm', unit));
    }
  });

  it('leaves angles in degrees whatever the length unit is', () => {
    // A menu offering millimetres has nothing to say about an angle.
    expect(formatIn(30, '°', 'in')).toBe('30.0°');
  });
});
