/**
 * Framing the camera on the model.
 *
 * A CAD file's coordinates are wherever the modeller left them. A part can be
 * four millimetres across and sit a metre and a half from the origin, and both
 * facts are perfectly ordinary. So neither the camera nor the ground grid can
 * be written down as constants: they have to be derived from the model's own
 * bounding box, the same way the section plane already is.
 */

import type { BBox } from './metadata';

/**
 * The direction the camera looks from, as a unit vector in CAD coordinates.
 *
 * This is the three-quarter view the viewer has always opened with, kept as a
 * direction so that it survives being applied to a model of any size.
 */
const VIEW_DIRECTION: readonly [number, number, number] = [0.6024, -0.6693, 0.435];

/** Vertical field of view, in degrees. Shared with the Canvas camera. */
export const FOV = 40;

/** How much empty space to leave around the model, as a multiple of its size. */
const PADDING = 1.35;

export type Framing = {
  position: [number, number, number];
  target: [number, number, number];
  near: number;
  far: number;
  /** Grid square, in model units. A round number near a tenth of the model. */
  cellSize: number;
  sectionSize: number;
  fadeDistance: number;
  /** Where the ground plane sits: level with the bottom of the model. */
  ground: [number, number, number];
};

/**
 * Round to 1, 2 or 5 times a power of ten.
 *
 * A grid is a measuring aid, so its squares should be numbers a person can
 * count in -- 0.5 mm, 20 mm -- and never 0.83 mm.
 */
export function niceStep(value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled >= 5 ? 5 : scaled >= 2 ? 2 : 1;
  return step * magnitude;
}

export function frameModel(bounds: BBox): Framing {
  const [low, high] = bounds;

  const centre: [number, number, number] = [
    (low[0] + high[0]) / 2,
    (low[1] + high[1]) / 2,
    (low[2] + high[2]) / 2,
  ];

  const span = Math.hypot(high[0] - low[0], high[1] - low[1], high[2] - low[2]);
  // A model with no extent -- a single point, or an empty part list -- would
  // otherwise put the camera on top of its own target and divide by zero.
  const size = span > 0 ? span : 1;

  // Half the model has to fit inside half the field of view.
  const distance = (size / 2 / Math.tan(((FOV / 2) * Math.PI) / 180)) * PADDING;

  return {
    position: [
      centre[0] + VIEW_DIRECTION[0] * distance,
      centre[1] + VIEW_DIRECTION[1] * distance,
      centre[2] + VIEW_DIRECTION[2] * distance,
    ],
    target: centre,
    // Both planes are tied to the model rather than to fixed millimetres, so
    // the depth buffer keeps its precision on a 4 mm part and still reaches
    // the far side of a 4 m one.
    near: Math.max(size / 1000, 1e-4),
    far: distance * 10 + size * 10,
    cellSize: niceStep(size / 10),
    sectionSize: niceStep(size / 10) * 5,
    fadeDistance: distance * 4,
    ground: [centre[0], centre[1], low[2]],
  };
}
