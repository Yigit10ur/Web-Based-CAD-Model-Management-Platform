/**
 * The mouse layout.
 *
 * Copied from the package the people using this already have open, so the
 * cases below are its behaviour rather than a preference: the middle button
 * rotates, the modifiers change what it does, and the left button is left for
 * selecting. A layout that is nearly right is worse than an unfamiliar one --
 * a hand that expects pan and gets rotate has to stop and look.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  bindingsFor,
  effectiveAction,
  keyLabelsFor,
  isDoubleClick,
  modifierOf,
  rollAngle,
  DOUBLE_CLICK_MS,
  INTENT,
  type NavigationModifier,
} from '@/lib/navigation';

const MODIFIERS: NavigationModifier[] = ['none', 'ctrl', 'shift', 'alt'];

const keys = (patch: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {}) => ({
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...patch,
});

describe('which modifier is in force', () => {
  it('reports none when nothing is held', () => {
    expect(modifierOf(keys())).toBe('none');
  });

  it.each<[string, NavigationModifier]>([
    ['ctrlKey', 'ctrl'],
    ['shiftKey', 'shift'],
    ['altKey', 'alt'],
  ])('reports %s', (key, expected) => {
    expect(modifierOf(keys({ [key]: true }))).toBe(expected);
  });

  it('treats Command as Control', () => {
    // The layout is a Windows one and the key is under the same thumb. Without
    // this, panning is unreachable on a Mac.
    expect(modifierOf(keys({ metaKey: true }))).toBe('ctrl');
  });

  it('resolves two at once the same way every time', () => {
    // Not a case anyone means to be in, but one a hand passes through on the
    // way to another. "Whichever the browser reported first" is not something
    // a user can predict.
    expect(modifierOf(keys({ ctrlKey: true, shiftKey: true }))).toBe('ctrl');
    expect(modifierOf(keys({ shiftKey: true, altKey: true }))).toBe('shift');
  });
});

describe('what the buttons actually do', () => {
  /*
   * Asserted through `effectiveAction`, not on the raw map. The first version
   * of these tests checked what we asked the controls for, and passed while
   * the application was broken: OrbitControls swaps ROTATE and PAN whenever a
   * modifier is held, so asking it to pan under Ctrl got rotation. A test that
   * cannot see that is a test of our intentions.
   */
  it.each<NavigationModifier>(['none', 'ctrl', 'shift'])(
    'does what the layout says under %s',
    (modifier) => {
      expect(effectiveAction(bindingsFor(modifier).MIDDLE, modifier)).toBe(INTENT[modifier]);
    },
  );

  it('hands Alt to the roll handler instead of to the controls', () => {
    // Roll is not one of the three things OrbitControls can do, so the split
    // is deliberate: the controls are told to do nothing, and the drag is
    // read separately. Bound to rotate here, a drag meant to level the view
    // would spin the model at the same time.
    expect(INTENT.alt).toBe('roll');
    expect(effectiveAction(bindingsFor('alt').MIDDLE, 'alt')).toBe('none');
  });

  it('pans on the right button whatever is held', () => {
    // Not a CAD binding -- there is no context menu to protect here -- and the
    // only way to pan on hardware with no middle button. It has to survive the
    // swap too.
    for (const modifier of MODIFIERS) {
      expect(effectiveAction(bindingsFor(modifier).RIGHT, modifier)).toBe('pan');
    }
  });

  it('never gives the left button to the camera', () => {
    // The one rule the whole layout rests on: left is for selecting. A left
    // drag that rotated would eat the click meant for a face.
    for (const modifier of MODIFIERS) {
      expect(effectiveAction(bindingsFor(modifier).LEFT, modifier)).toBe('none');
    }
  });

  it('gives each modifier a different action', () => {
    // Two modifiers doing the same thing would mean one of them is not wired.
    const actions = MODIFIERS.map((modifier) =>
      effectiveAction(bindingsFor(modifier).MIDDLE, modifier),
    );

    expect(new Set(actions).size).toBe(MODIFIERS.length);
  });
});

describe("the controls' own modifier rule", () => {
  /*
   * Modelled rather than worked around, so that a library upgrade which
   * changes it fails here with a name instead of quietly turning panning back
   * into rotation on somebody's desk.
   */
  it('swaps rotate and pan while Ctrl or Shift is held', () => {
    expect(effectiveAction(THREE.MOUSE.ROTATE, 'ctrl')).toBe('pan');
    expect(effectiveAction(THREE.MOUSE.PAN, 'ctrl')).toBe('rotate');
    expect(effectiveAction(THREE.MOUSE.ROTATE, 'shift')).toBe('pan');
  });

  it('leaves zoom alone, which is why Shift can reach it', () => {
    expect(effectiveAction(THREE.MOUSE.DOLLY, 'shift')).toBe('zoom');
  });

  it('does not watch Alt, which is why roll is ours to do', () => {
    expect(effectiveAction(THREE.MOUSE.ROTATE, 'alt')).toBe('rotate');
    expect(effectiveAction(undefined, 'alt')).toBe('none');
  });
});

describe('the second press of a double-click', () => {
  it('is one when it lands inside the window', () => {
    expect(isDoubleClick(1000, 1000 + DOUBLE_CLICK_MS - 1)).toBe(true);
  });

  it('is not one when it lands outside it', () => {
    expect(isDoubleClick(1000, 1000 + DOUBLE_CLICK_MS + 1)).toBe(false);
  });

  it('is not one when there was no first press', () => {
    // A fresh viewer, or the press after a fit already happened. Treating null
    // as zero would make the very first middle-click fit the view.
    expect(isDoubleClick(null, 5)).toBe(false);
  });
});

describe('roll', () => {
  it('turns half a circle across the full width', () => {
    expect(rollAngle(800, 800)).toBeCloseTo(Math.PI, 9);
    expect(rollAngle(-800, 800)).toBeCloseTo(-Math.PI, 9);
  });

  it('turns the same amount whatever the window size', () => {
    // Otherwise the same movement of the hand does different things on a
    // laptop and on the workstation beside it.
    expect(rollAngle(200, 800)).toBeCloseTo(rollAngle(400, 1600), 9);
  });

  it('does nothing before the canvas has a width', () => {
    // A hidden or not-yet-measured canvas reports zero, and dividing by it
    // would set `up` to NaN -- which does not throw, it just makes the model
    // disappear.
    expect(rollAngle(50, 0)).toBe(0);
  });
});

describe('what the keys are called', () => {
  /*
   * This was a real half hour lost. The legend said "alt roll", a Mac keyboard
   * has no key marked Alt, and the feature was reported as not working -- it
   * worked perfectly under Option the whole time. A legend naming a key nobody
   * can find is worse than no legend: it reads as something broken.
   */
  it('uses the Mac names on a Mac', () => {
    const keys = keyLabelsFor(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    );

    expect(keys.roll).toBe('⌥');
    expect(keys.pan).toBe('⌘');
  });

  it('uses the plain names elsewhere', () => {
    const keys = keyLabelsFor('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');

    expect(keys.roll).toBe('alt');
    expect(keys.pan).toBe('ctrl');
  });

  it('falls back to the plain names when there is nothing to look at', () => {
    // What the server renders. It has no keyboard, and guessing Mac there
    // would be a hydration mismatch on every other machine.
    expect(keyLabelsFor('').roll).toBe('alt');
  });

  it('offers Command, which the layout actually accepts', () => {
    // Naming a key that does nothing would be the same mistake again, the
    // other way round.
    expect(
      modifierOf({ ctrlKey: false, shiftKey: false, altKey: false, metaKey: true }),
    ).toBe('ctrl');
  });
});
