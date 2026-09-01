/**
 * The standard views.
 *
 * A CAD package offers these by name, and they are not guesses: front is
 * looking down +Y, top is looking down -Z, and the world is Z-up because CAD
 * data is Z-up.
 *
 * Written here rather than taken from the axis gizmo because drei's gizmo
 * measures the distance to move the camera as `camera.position.distanceTo(new
 * Vector3())` -- the distance to the world *origin*, not to what is being
 * looked at. Assemblies routinely sit a long way from the origin, and clicking
 * an axis then threw the camera that same distance past them: a 4 mm part
 * viewed from 1.7 m away is a blank screen. Same family as the bug that made
 * the viewer look empty before `frameModel` existed.
 */

import type { Vec3 } from './metadata';

export type ViewName =
  | 'iso'
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom';

export interface StandardView {
  name: ViewName;
  label: string;
  /** Unit vector from what is being looked at towards the camera. */
  direction: Vec3;
  /** Which way is up on screen. */
  up: Vec3;
}

const ISO = Math.sqrt(1 / 3);

export const STANDARD_VIEWS: StandardView[] = [
  // The direction the model is framed from when it is opened.
  { name: 'iso', label: 'Isometric', direction: [ISO, -ISO, ISO], up: [0, 0, 1] },
  { name: 'front', label: 'Front', direction: [0, -1, 0], up: [0, 0, 1] },
  { name: 'back', label: 'Back', direction: [0, 1, 0], up: [0, 0, 1] },
  { name: 'left', label: 'Left', direction: [-1, 0, 0], up: [0, 0, 1] },
  { name: 'right', label: 'Right', direction: [1, 0, 0], up: [0, 0, 1] },
  /*
   * Looking straight down, so Z cannot also be up -- a camera whose up is its
   * own view direction has no orientation to take. +Y is up on screen, which
   * is what a drawing's top view shows.
   */
  { name: 'top', label: 'Top', direction: [0, 0, 1], up: [0, 1, 0] },
  { name: 'bottom', label: 'Bottom', direction: [0, 0, -1], up: [0, 1, 0] },
];

export function viewByName(name: ViewName): StandardView {
  const found = STANDARD_VIEWS.find((view) => view.name === name);
  if (!found) throw new Error(`no standard view called ${name}`);
  return found;
}

/**
 * Where to put the camera for a view.
 *
 * The distance is kept, not recomputed: someone who has zoomed in on a feature
 * and asks for the top view wants that feature from above, not the whole
 * assembly again. Fit is a separate action, on its own key.
 */
export function cameraFor(
  view: StandardView,
  target: Vec3,
  distance: number,
): { position: Vec3; up: Vec3 } {
  const safe = distance > 0 ? distance : 1;

  return {
    position: [
      target[0] + view.direction[0] * safe,
      target[1] + view.direction[1] * safe,
      target[2] + view.direction[2] * safe,
    ],
    up: view.up,
  };
}
