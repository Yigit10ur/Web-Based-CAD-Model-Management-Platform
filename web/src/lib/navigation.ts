/**
 * How the mouse drives the camera.
 *
 * The SolidWorks layout, because that is what the people using this already
 * have in their hands:
 *
 *   middle drag            rotate
 *   Ctrl + middle drag     pan
 *   Shift + middle drag    zoom
 *   Alt + middle drag      roll, in the plane of the screen
 *   wheel                  zoom
 *   middle double-click    fit the model to the screen
 *
 * The left button is not a navigation button. In a CAD package it selects, and
 * a left drag that quietly rotated the model would take the click someone
 * meant for a face.
 *
 * three.js gives one fixed button-to-action map and no notion of a modifier
 * changing it, so the map is rebuilt whenever a modifier goes down or up. The
 * decision is here, as data, so it can be tested without a scene or a browser.
 */

import * as THREE from 'three';

export type NavigationModifier = 'none' | 'ctrl' | 'shift' | 'alt';

/** What each button does. `undefined` leaves the button to the application. */
export interface MouseBindings {
  LEFT?: THREE.MOUSE;
  MIDDLE?: THREE.MOUSE;
  RIGHT?: THREE.MOUSE;
}

/**
 * Which modifier is in force.
 *
 * One at a time and in a fixed order, because two held together has no meaning
 * here and "whichever the browser reported first" is not an answer anyone can
 * predict. Command counts as Control: the layout is a Windows one, and a Mac
 * has the key under the same thumb.
 */
export function modifierOf(event: {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): NavigationModifier {
  if (event.ctrlKey || event.metaKey) return 'ctrl';
  if (event.shiftKey) return 'shift';
  if (event.altKey) return 'alt';
  return 'none';
}

export function bindingsFor(modifier: NavigationModifier): MouseBindings {
  switch (modifier) {
    case 'ctrl':
      return { LEFT: undefined, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    case 'shift':
      return { LEFT: undefined, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    /*
     * Roll is not one of the three things OrbitControls can do, so the middle
     * button is left unbound here and the roll is applied by hand. Binding it
     * to rotate instead would spin the model on a drag that was meant to level
     * the view.
     */
    case 'alt':
      return { LEFT: undefined, MIDDLE: undefined, RIGHT: THREE.MOUSE.PAN };
    default:
      return { LEFT: undefined, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
  }
}

/** Two presses of the same button this close together are a double-click. */
export const DOUBLE_CLICK_MS = 400;

export function isDoubleClick(previous: number | null, now: number): boolean {
  return previous !== null && now - previous <= DOUBLE_CLICK_MS;
}

/**
 * How far a roll drag turns the view.
 *
 * Across the full width of the viewport is half a turn, which is enough to
 * level a view in one movement without a small movement throwing it away.
 */
export function rollAngle(deltaX: number, viewportWidth: number): number {
  if (viewportWidth <= 0) return 0;
  return (deltaX / viewportWidth) * Math.PI;
}
