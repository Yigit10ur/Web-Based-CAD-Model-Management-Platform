import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';

import type { SnapTarget } from '@/lib/snap';
import { useViewerStore } from '@/store/viewer-store';

const snapTarget = (x: number, y: number, z: number, label = 'corner'): SnapTarget => ({
  point: new THREE.Vector3(x, y, z),
  kind: 'vertex',
  partId: 'n1_1',
  index: null,
  label,
});

/** Everything a user can do to one model before opening another. */
function workOnAModel() {
  const store = useViewerStore.getState();
  store.addMeasurementPoint(snapTarget(0, 0, 0));
  store.addMeasurementPoint(snapTarget(3, 4, 0));
  store.setVisibility(['n1_3', 'n1_7'], false);
  store.select('n1_2', 5);
  store.setTool('measure');
  store.setExplode(0.4);
  store.setSection({ enabled: true, axis: 'x' });
  store.setHover(snapTarget(1, 1, 1));
  store.addMeasurementPoint(snapTarget(9, 9, 9));
}

describe('viewer store', () => {
  beforeEach(() => {
    useViewerStore.getState().reset();
  });

  it('carries nothing from one model to the next', () => {
    workOnAModel();

    const dirty = useViewerStore.getState();
    expect(dirty.measurements).toHaveLength(1);
    expect(dirty.hidden.size).toBe(2);

    useViewerStore.getState().reset();

    const clean = useViewerStore.getState();
    // The reported bug: a measurement taken on one assembly reappeared on the
    // next one, drawn across geometry it was never taken from.
    expect(clean.measurements).toEqual([]);
    // Quieter but worse: part ids restart at n1_1 in every file, so a hidden
    // part carried over hides an unrelated one.
    expect(clean.hidden.size).toBe(0);
    expect(clean.selected).toBeNull();
    expect(clean.selectedFace).toBeNull();
    expect(clean.tool).toBe('select');
    expect(clean.explode).toBe(0);
    expect(clean.hover).toBeNull();
    expect(clean.pending).toBeNull();
    expect(clean.section).toEqual({ enabled: false, axis: 'z', position: 0.5, flipped: false });
  });

  it('leaves no half-finished measurement behind', () => {
    // One click, not two: a first point with no second.
    useViewerStore.getState().addMeasurementPoint(snapTarget(1, 2, 3));
    expect(useViewerStore.getState().pending).not.toBeNull();

    useViewerStore.getState().reset();
    expect(useViewerStore.getState().pending).toBeNull();
  });

  it('hands out a fresh hidden set each time', () => {
    // A shared Set instance would be mutated by the first model and arrive
    // dirty at the second, which the assertions above would not catch.
    useViewerStore.getState().setVisibility(['n1_1'], false);
    const first = useViewerStore.getState().hidden;

    useViewerStore.getState().reset();
    const second = useViewerStore.getState().hidden;

    expect(second).not.toBe(first);
    expect(second.size).toBe(0);
  });
});
