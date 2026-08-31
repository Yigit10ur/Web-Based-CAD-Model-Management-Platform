/**
 * The section (clipping) plane.
 *
 * The plane is a direction plus a 0..1 position across the model, never a world
 * coordinate, so one control behaves the same on a 4 mm part and a 4 m
 * assembly.
 *
 * The direction used to be one of three axes. It is now any unit vector, and
 * X/Y/Z are the three that happen to be named -- which is what lets a cut be
 * taken along a face of the model, or tilted off one, without a second code
 * path. A CAD package offers the same three things in the same order: the
 * standard planes, a planar face to borrow a direction from, and two dials to
 * rotate away from whichever you picked.
 */

import * as THREE from 'three';

import type { BBox, FaceGeometry, PartMetadata, Vec3 } from './metadata';

/** Where the cut takes its direction from. */
export type SectionReference = 'x' | 'y' | 'z' | 'custom';

const BASE_NORMAL: Record<Exclude<SectionReference, 'custom'>, Vec3> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

/** Everything that decides where the plane sits. */
export interface SectionPlacement {
  reference: SectionReference;
  /** The borrowed direction, used when `reference` is `custom`. */
  normal: Vec3;
  /** 0..1 across the model along the normal. */
  position: number;
  /** Which half of the model the plane keeps. */
  flipped: boolean;
  /** Degrees away from the reference direction, about the plane's own axes. */
  rotateX: number;
  rotateY: number;
}

const DEGREE = Math.PI / 180;

/** Bounding box of the whole model, in CAD coordinates. */
export function modelBounds(parts: Record<string, PartMetadata>): BBox {
  const entries = Object.values(parts);
  if (entries.length === 0) {
    return [
      [0, 0, 0],
      [1, 1, 1],
    ];
  }

  const low: Vec3 = [Infinity, Infinity, Infinity];
  const high: Vec3 = [-Infinity, -Infinity, -Infinity];

  for (const part of entries) {
    for (let axis = 0; axis < 3; axis += 1) {
      low[axis] = Math.min(low[axis], part.bbox[0][axis]);
      high[axis] = Math.max(high[axis], part.bbox[1][axis]);
    }
  }

  return [low, high];
}

/**
 * An axis lying in the plane, picked so it never collapses.
 *
 * Crossing the normal with a world axis gives nothing when the two are
 * parallel, so the one the normal leans on least is used -- it is the furthest
 * from parallel that a world axis can be, and there is always one.
 */
function inPlaneAxis(normal: THREE.Vector3): THREE.Vector3 {
  const weakest =
    Math.abs(normal.x) <= Math.abs(normal.y) && Math.abs(normal.x) <= Math.abs(normal.z)
      ? new THREE.Vector3(1, 0, 0)
      : Math.abs(normal.y) <= Math.abs(normal.z)
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);

  return weakest.cross(normal).normalize();
}

/**
 * The direction the plane faces, reference and rotation together.
 *
 * The two rotations are sequential rather than independent: the second turns
 * about an axis of the plane the first one left behind. That is what makes the
 * dials behave the way a hand does -- tilt, then tilt the tilted thing --
 * instead of two rotations racing about fixed axes.
 */
export function sectionNormal(placement: SectionPlacement): THREE.Vector3 {
  const source =
    placement.reference === 'custom' ? placement.normal : BASE_NORMAL[placement.reference];

  const base = new THREE.Vector3(source[0], source[1], source[2]);
  // A face that reported no usable normal must not produce a zero-length plane
  // that clips everything or nothing depending on the driver.
  if (base.lengthSq() === 0) base.set(0, 0, 1);
  base.normalize();

  if (placement.rotateX === 0 && placement.rotateY === 0) return base;

  const first = inPlaneAxis(base);
  const tilted = base.clone().applyAxisAngle(first, placement.rotateX * DEGREE);

  const second = tilted.clone().cross(first).normalize();
  return tilted.applyAxisAngle(second, placement.rotateY * DEGREE).normalize();
}

/**
 * How far the model reaches along a direction.
 *
 * The box is axis-aligned, so its extent along any direction is its centre
 * projected onto that direction, give or take the projections of its three
 * half-extents. That is the same answer as projecting all eight corners, for a
 * third of the arithmetic.
 */
export function extentAlong(normal: THREE.Vector3, bounds: BBox): [number, number] {
  const [low, high] = bounds;

  let middle = 0;
  let reach = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const component = normal.getComponent(axis);
    middle += ((low[axis] + high[axis]) / 2) * component;
    reach += Math.abs(((high[axis] - low[axis]) / 2) * component);
  }

  return [middle - reach, middle + reach];
}

/** Half a thousandth of the model's reach, added at each end. */
function margin(low: number, high: number): number {
  return (high - low) * 0.001;
}

/** Where the plane cuts, as a distance along its own normal. */
export function cutDistance(placement: SectionPlacement, bounds: BBox): number {
  const [low, high] = extentAlong(sectionNormal(placement), bounds);
  const edge = margin(low, high);
  return low - edge + (high - low + edge * 2) * placement.position;
}

/**
 * Build the clipping plane.
 *
 * The plane is nudged just past the model at the extremes so that the slider
 * can be taken fully to either end without a sliver being clipped away when
 * the user meant "off".
 */
export function sectionPlane(placement: SectionPlacement, bounds: BBox): THREE.Plane {
  const normal = sectionNormal(placement);
  const at = cutDistance(placement, bounds);

  // three.js keeps the half space where normal . point + constant > 0. With
  // the normal pointing back down the direction, that is everything below
  // `at`; flipping the normal keeps the other half instead.
  const sign = placement.flipped ? 1 : -1;
  return new THREE.Plane(normal.multiplyScalar(sign), -sign * at);
}

/**
 * The slider value that puts the plane through a point.
 *
 * The exact inverse of `cutDistance`, which is what lets a face be clicked and
 * the cut land on it rather than near it.
 */
export function positionOfPoint(
  point: THREE.Vector3,
  placement: SectionPlacement,
  bounds: BBox,
): number {
  const normal = sectionNormal(placement);
  const [low, high] = extentAlong(normal, bounds);
  const edge = margin(low, high);
  const span = high - low + edge * 2;
  if (span === 0) return 0.5;

  return THREE.MathUtils.clamp((point.dot(normal) - (low - edge)) / span, 0, 1);
}

/** How the direction reads in the panel: a named axis, or the vector itself. */
export function describeNormal(placement: SectionPlacement): string {
  if (placement.reference !== 'custom' && placement.rotateX === 0 && placement.rotateY === 0) {
    return placement.reference.toUpperCase();
  }

  const normal = sectionNormal(placement);
  return `${normal.x.toFixed(3)}, ${normal.y.toFixed(3)}, ${normal.z.toFixed(3)}`;
}

/** What clicking a face during a pick should do. */
export type FaceReference =
  | { taken: true; normal: Vec3; position: number }
  | { taken: false; reason: string };

/**
 * Borrow a face's direction for the section plane.
 *
 * Only a planar face has one direction to lend. A cylinder has a different
 * normal at every point on it, so there is nothing to borrow, and a CAD
 * package refuses the same selection for the same reason.
 *
 * The direction comes from the B-rep, never from the triangle that was hit: a
 * tessellated face is a fan of triangles whose normals differ from the surface
 * by the tessellation error, and a cut a fifth of a degree off the face it was
 * taken from is worse than no feature at all. The clicked point only decides
 * where along that direction the cut lands.
 */
export function faceReference(
  face: FaceGeometry | undefined,
  point: THREE.Vector3,
  bounds: BBox,
): FaceReference {
  if (!face) return { taken: false, reason: 'That is not a face of the model.' };

  if (face.kind !== 'plane' || !face.normal) {
    return {
      taken: false,
      reason: `A ${face.kind} face has no single direction — pick a flat one.`,
    };
  }

  const placement: SectionPlacement = {
    reference: 'custom',
    normal: face.normal,
    position: 0.5,
    flipped: false,
    // Rotation is measured from the reference, so a face being taken as the
    // new reference starts level rather than inheriting a tilt that was set
    // against the old one.
    rotateX: 0,
    rotateY: 0,
  };

  return {
    taken: true,
    normal: face.normal,
    // The cut lands on the face that was clicked, which is where a section
    // taken from a face is expected to start.
    position: positionOfPoint(point, placement, bounds),
  };
}
