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

/** What a drag should actually do, once everything has had its say. */
export type NavigationAction = 'rotate' | 'pan' | 'zoom' | 'roll' | 'none';

/** The layout, as the person using it experiences it. */
export const INTENT: Record<NavigationModifier, NavigationAction> = {
  none: 'rotate',
  ctrl: 'pan',
  shift: 'zoom',
  alt: 'roll',
};

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

/**
 * What the controls will *do* with a button we have asked to do something.
 *
 * three-stdlib's OrbitControls applies a rule of its own before ours: while
 * Ctrl, Command or Shift is held it swaps ROTATE and PAN, on the theory that a
 * modifier means "the other one". DOLLY is left alone, and Alt is not one of
 * the keys it watches.
 *
 * So the action asked for is not the action delivered, and the map below has
 * to be written in terms of what comes out of this function rather than what
 * goes into it. Modelling the rule here rather than working around it silently
 * means a library upgrade that changes it breaks a test with a name, instead
 * of quietly turning panning back into rotation.
 */
export function effectiveAction(
  requested: THREE.MOUSE | undefined,
  modifier: NavigationModifier,
): NavigationAction {
  const swaps = modifier === 'ctrl' || modifier === 'shift';

  switch (requested) {
    case THREE.MOUSE.ROTATE:
      return swaps ? 'pan' : 'rotate';
    case THREE.MOUSE.PAN:
      return swaps ? 'rotate' : 'pan';
    case THREE.MOUSE.DOLLY:
      return 'zoom';
    default:
      return 'none';
  }
}

export function bindingsFor(modifier: NavigationModifier): MouseBindings {
  switch (modifier) {
    /*
     * ROTATE, not PAN. Ctrl already turns rotation into panning inside the
     * controls; asking for PAN as well turns it back into rotation, which is
     * exactly the bug this comment exists to prevent being reintroduced.
     */
    case 'ctrl':
      return { LEFT: undefined, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.ROTATE };
    /* DOLLY is the one action the swap does not touch. */
    case 'shift':
      return { LEFT: undefined, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    /*
     * Roll is not one of the three things OrbitControls can do, so the middle
     * button is left unbound and the roll is applied by hand. Alt is not a key
     * the controls watch, so nothing is swapped here.
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
