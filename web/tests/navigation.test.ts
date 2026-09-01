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
  isDoubleClick,
  modifierOf,
  rollAngle,
  DOUBLE_CLICK_MS,
  type NavigationModifier,
} from '@/lib/navigation';

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

describe('what the buttons do', () => {
  it('rotates on the middle button with nothing held', () => {
    expect(bindingsFor('none').MIDDLE).toBe(THREE.MOUSE.ROTATE);
  });

  it('pans with Control and zooms with Shift', () => {
    expect(bindingsFor('ctrl').MIDDLE).toBe(THREE.MOUSE.PAN);
    expect(bindingsFor('shift').MIDDLE).toBe(THREE.MOUSE.DOLLY);
  });

  it('leaves the middle button to the roll handler under Alt', () => {
    // Bound to rotate here, the model would spin during a drag meant to level
    // the view -- both would happen at once.
    expect(bindingsFor('alt').MIDDLE).toBeUndefined();
  });

  it('never gives the left button to the camera', () => {
    // The one rule the whole layout rests on: left is for selecting. A left
    // drag that rotated would eat the click meant for a face.
    for (const modifier of ['none', 'ctrl', 'shift', 'alt'] as NavigationModifier[]) {
      expect(bindingsFor(modifier).LEFT).toBeUndefined();
    }
  });

  it('keeps panning available on the right button throughout', () => {
    // Not a CAD binding -- there is no context menu to protect here -- and the
    // only way to pan on hardware with no middle button.
    for (const modifier of ['none', 'ctrl', 'shift', 'alt'] as NavigationModifier[]) {
      expect(bindingsFor(modifier).RIGHT).toBe(THREE.MOUSE.PAN);
    }
  });

  it('gives each modifier its own action', () => {
    // Two modifiers doing the same thing would mean one of them is not wired.
    const middles = (['none', 'ctrl', 'shift'] as NavigationModifier[]).map(
      (modifier) => bindingsFor(modifier).MIDDLE,
    );

    expect(new Set(middles).size).toBe(3);
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
