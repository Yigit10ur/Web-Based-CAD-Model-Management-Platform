'use client';

import { useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

import type { Framing } from '@/lib/framing';
import {
  bindingsFor,
  isDoubleClick,
  modifierOf,
  rollAngle,
  type NavigationModifier,
} from '@/lib/navigation';

interface OrbitLike {
  target: THREE.Vector3;
  update: () => void;
}

/**
 * The camera, driven the way a CAD package drives it.
 *
 *   middle drag            rotate
 *   Ctrl + middle drag     pan
 *   Shift + middle drag    zoom
 *   Alt + middle drag      roll
 *   wheel                  zoom
 *   middle double-click    fit the model, and so does `f`
 *
 * The left button is left alone, because in a CAD package it selects. A left
 * drag that also rotated would take the click somebody meant for a face.
 *
 * three.js maps a button to an action once and has no notion of a modifier
 * changing it, so the map is handed to the controls as a prop and rebuilt as
 * modifiers go down and up. Two things it cannot do at all -- rolling the
 * view, and fitting the model -- are done here directly.
 */
export function Navigation({ view }: { view: Framing }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitLike | null;
  const gl = useThree((state) => state.gl);

  const [modifier, setModifier] = useState<NavigationModifier>('none');

  /*
   * The same value again, for the event handlers. They are registered once, so
   * they cannot read the state -- and re-registering them on every modifier
   * press would drop a drag in progress.
   */
  const held = useRef<NavigationModifier>('none');
  const rolling = useRef<{ x: number } | null>(null);
  const lastMiddleDown = useRef<number | null>(null);

  useEffect(() => {
    if (!controls) return;

    const canvas = gl.domElement;

    /** Put the camera back where opening the model put it. */
    const fit = () => {
      camera.position.set(...view.position);
      camera.up.set(0, 0, 1);
      camera.lookAt(...view.target);
      camera.updateProjectionMatrix();
      controls.target.set(...view.target);
      controls.update();
    };

    const setModifierFrom = (event: KeyboardEvent | { ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }) => {
      const next = modifierOf(event);
      if (held.current === next) return;
      held.current = next;
      setModifier(next);
    };

    const onKey = (event: KeyboardEvent) => setModifierFrom(event);

    /*
     * A modifier held while the window loses focus is never released, and the
     * next drag then pans when it was asked to rotate.
     */
    const onBlur = () => {
      if (held.current === 'none') return;
      held.current = 'none';
      setModifier('none');
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 1) return;

      // Middle-drag is the browser's autoscroll on Windows. It has to be
      // refused before it starts, or the page scrolls while the model rotates.
      event.preventDefault();

      const now = performance.now();
      if (isDoubleClick(lastMiddleDown.current, now)) {
        lastMiddleDown.current = null;
        fit();
        return;
      }
      lastMiddleDown.current = now;

      if (held.current === 'alt') rolling.current = { x: event.clientX };
    };

    const axis = new THREE.Vector3();

    const onPointerMove = (event: PointerEvent) => {
      if (!rolling.current) return;

      /*
       * Roll turns the camera about the line it is looking along, which is the
       * one rotation an orbit control does not offer: it holds `up` fixed by
       * design. Turning `up` is the whole of it.
       */
      const delta = event.clientX - rolling.current.x;
      rolling.current.x = event.clientX;

      camera.getWorldDirection(axis);
      camera.up.applyAxisAngle(axis, rollAngle(delta, canvas.clientWidth));
      controls.update();
    };

    const stopRoll = () => {
      rolling.current = null;
    };

    // Middle-click opens a link or pastes, depending on the platform. Neither
    // is wanted over a 3D view.
    const onAuxClick = (event: MouseEvent) => {
      if (event.button === 1) event.preventDefault();
    };

    // `f` fits the view, as it does in the package this layout comes from.
    const onFitKey = (event: KeyboardEvent) => {
      if (event.key !== 'f' && event.key !== 'F') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      // Not while somebody is typing.
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable]')) return;

      fit();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('keydown', onFitKey);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopRoll);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('auxclick', onAuxClick);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('keydown', onFitKey);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopRoll);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('auxclick', onAuxClick);
    };
  }, [camera, controls, gl, view]);

  return (
    <OrbitControls
      makeDefault
      // A nicety on a camera being flown, and a lag on one being aimed at a
      // feature.
      enableDamping={false}
      /*
       * The wheel zooms towards the pointer rather than towards the middle of
       * the screen, which is what a CAD package does and what this application
       * is for: you put the cursor on the feature you want to look at and it
       * comes to you. Zooming at the centre means panning afterwards, every
       * time.
       */
      zoomToCursor
      mouseButtons={bindingsFor(modifier)}
    />
  );
}
