/**
 * What two picks mean.
 *
 * Point to point is a length and always has been. Two flat faces are a
 * different question -- the one an engineer actually asks of a drawing: how
 * thick is that, how wide is the gap. So picking two faces measures between
 * the surfaces rather than between the two places the cursor happened to land
 * on them, which is what a CAD viewer does.
 *
 * What is deliberately not offered:
 *
 * Curved faces. A cylinder's `FaceGeometry` carries its radius and the
 * direction of its axis, but not where that axis is, and the point under the
 * cursor is off the true surface by the tessellation error. There is nothing
 * here to be exact with, and this application does not offer a measurement it
 * cannot stand behind.
 *
 * A distance between two faces that are not parallel. They meet; the distance
 * between them is zero somewhere and anything you like elsewhere. The angle
 * between them is the well-defined question, so that is what is answered.
 */

import * as THREE from 'three';

import type { FaceGeometry } from './metadata';
import type { SnapTarget } from './snap';

export type MeasurementKind = 'length' | 'gap' | 'angle';

export interface MeasurementResult {
  kind: MeasurementKind;
  /** The two ends of the line to draw. */
  from: THREE.Vector3;
  to: THREE.Vector3;
  value: number;
  unit: 'mm' | '°';
  /** What was measured, for anyone reading the drawing later. */
  description: string;
}

/** Two normals count as parallel within about a tenth of a degree. */
const PARALLEL = 0.999999;

function planeOf(target: SnapTarget): { normal: THREE.Vector3; point: THREE.Vector3 } | null {
  const face: FaceGeometry | undefined = target.face;
  if (target.kind !== 'face' || !face || face.kind !== 'plane' || !face.normal) return null;

  const normal = new THREE.Vector3(...face.normal);
  if (normal.lengthSq() === 0) return null;

  /*
   * The normal is exact, from the B-rep. The point is the one under the
   * cursor, and for a plane that is exact too: a flat face tessellates into
   * triangles that lie on it, so a hit on one of them is a point on the
   * surface rather than near it. This is the only face kind that is true of.
   */
  return { normal: normal.normalize(), point: target.point.clone() };
}

export function measure(a: SnapTarget, b: SnapTarget): MeasurementResult {
  const first = planeOf(a);
  const second = planeOf(b);

  if (first && second) {
    const alignment = first.normal.dot(second.normal);

    if (Math.abs(alignment) >= PARALLEL) {
      /*
       * The perpendicular distance, and the line drawn along it rather than
       * between the two clicks -- a segment running diagonally across a gap is
       * longer than the gap and reads as the wrong measurement even with the
       * right number beside it.
       */
      const separation = second.point.clone().sub(first.point).dot(first.normal);

      return {
        kind: 'gap',
        from: first.point,
        to: first.point.clone().addScaledVector(first.normal, separation),
        value: Math.abs(separation),
        unit: 'mm',
        description: 'between faces',
      };
    }

    // Reported as the angle between the surfaces, which is what a drawing
    // dimensions: two faces 30° apart, not the 150° on the other side.
    const radians = Math.acos(Math.min(1, Math.abs(alignment)));

    return {
      kind: 'angle',
      from: first.point,
      to: second.point,
      value: (radians * 180) / Math.PI,
      unit: '°',
      description: 'between faces',
    };
  }

  return {
    kind: 'length',
    from: a.point.clone(),
    to: b.point.clone(),
    value: a.point.distanceTo(b.point),
    unit: 'mm',
    description: `${a.label} to ${b.label}`,
  };
}

/** How a reading is written next to the line. */
export function formatMeasurement(value: number, unit: 'mm' | '°'): string {
  return unit === '°' ? `${value.toFixed(1)}°` : `${value.toFixed(2)} mm`;
}
