import * as THREE from 'three';
import { create } from 'zustand';

import type { SectionPlacement } from '@/lib/section';
import type { ViewName } from '@/lib/views';
import {
  measureInMode,
  modeSpec,
  type MeasureMode,
  type MeasurementKind,
  type MeasureUnit,
} from '@/lib/measure';
import type { SnapTarget } from '@/lib/snap';

/**
 * Viewer state lives here, not in the scene graph.
 *
 * Visibility, selection and colour are read by R3F components from this store.
 * Keeping them out of the three.js objects is what stops the assembly tree and
 * the scene from drifting apart. See ARCHITECTURE.md section 6.
 */

export type ViewerTool = 'select' | 'measure';

export interface Measurement {
  id: string;
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** Millimetres for a length or a gap, degrees for an angle. */
  value: number;
  unit: 'mm' | '°';
  /** Which question was answered -- the reading alone does not say. */
  kind: MeasurementKind;
  /** What was measured, so a reader can tell corner from surface. */
  description: string;
}

export interface SectionState extends SectionPlacement {
  enabled: boolean;
  /**
   * Waiting for a face to be clicked.
   *
   * A mode of the section panel rather than a tool of its own, which is where
   * a CAD package puts it: you are picking a reference for this cut, not
   * changing what the pointer does from now on.
   */
  picking: boolean;
  /** Why the last pick was refused, cleared as soon as one is accepted. */
  pickError: string | null;
  /**
   * A handle is being dragged.
   *
   * Read by the camera controls, which have to stand still while it is: a
   * drag that both moved the plane and orbited the view would be unusable.
   */
  dragging: boolean;
}

interface ViewerState {
  /** Part ids currently hidden by the user. */
  hidden: Set<string>;
  /** Part id under selection, or null. */
  selected: string | null;
  /** Index of the selected B-rep face within the selected part, or null. */
  selectedFace: number | null;
  /** Active inspection tool. */
  tool: ViewerTool;
  /** 0 = assembled, 1 = fully exploded. */
  explode: number;

  /** Geometry under the cursor while measuring. */
  section: SectionState;

  /**
   * A standard view somebody asked for, and when.
   *
   * The timestamp is what makes asking for the same view twice count twice:
   * the camera has usually been moved in between, and a request that compared
   * equal to the last one would be ignored exactly when it was meant.
   */
  requestedView: { name: ViewName; at: number } | null;

  /** Which measurement is being taken, and how it should be read. */
  measureMode: MeasureMode;
  measureUnit: MeasureUnit;
  /** Why the last pick was refused, cleared as soon as one is accepted. */
  measureError: string | null;

  /** Geometry under the cursor while measuring. */
  hover: SnapTarget | null;
  /** First point of a measurement in progress. */
  pending: SnapTarget | null;
  measurements: Measurement[];

  select: (partId: string | null, face?: number | null) => void;
  toggleVisibility: (partId: string) => void;
  /** Show or hide a whole branch of the tree in one step. */
  setVisibility: (partIds: string[], visible: boolean) => void;
  isolate: (partId: string, allPartIds: string[]) => void;
  showAll: () => void;
  setTool: (tool: ViewerTool) => void;
  setExplode: (value: number) => void;
  setSection: (patch: Partial<SectionState>) => void;
  setView: (name: ViewName) => void;
  setMeasureMode: (mode: MeasureMode) => void;
  setMeasureUnit: (unit: MeasureUnit) => void;

  setHover: (target: SnapTarget | null) => void;
  addMeasurementPoint: (target: SnapTarget) => void;
  cancelPending: () => void;
  removeMeasurement: (id: string) => void;
  clearMeasurements: () => void;
  /** Drop everything that belongs to one model, ready for the next. */
  reset: () => void;
}

/**
 * The state that belongs to whichever model is open.
 *
 * All of it is per-model, and none of it means anything against a different
 * one: part ids are numbered from scratch in every file, so a hidden `n1_3`
 * carried over from the last model hides an unrelated part in this one, and a
 * measurement taken on one assembly draws itself across another.
 */
function initialState() {
  return {
    hidden: new Set<string>(),
    selected: null,
    selectedFace: null,
    tool: 'select' as ViewerTool,
    explode: 0,
    section: {
      enabled: false,
      picking: false,
      pickError: null,
      dragging: false,
      reference: 'z' as const,
      normal: [0, 0, 1] as [number, number, number],
      position: 0.5,
      flipped: false,
      rotateX: 0,
      rotateY: 0,
    },
    requestedView: null,
    measureMode: 'point-distance' as MeasureMode,
    // Not reset per model: it is how this person reads a drawing, not a
    // property of the thing being read.
    measureUnit: 'mm' as MeasureUnit,
    measureError: null,
    hover: null,
    pending: null,
    measurements: [],
  };
}

export const useViewerStore = create<ViewerState>((set) => ({
  ...initialState(),

  select: (partId, face = null) => set({ selected: partId, selectedFace: face }),

  setVisibility: (partIds, visible) =>
    set((state) => {
      const hidden = new Set(state.hidden);
      for (const partId of partIds) {
        if (visible) {
          hidden.delete(partId);
        } else {
          hidden.add(partId);
        }
      }
      return { hidden };
    }),

  toggleVisibility: (partId) =>
    set((state) => {
      const hidden = new Set(state.hidden);
      if (hidden.has(partId)) {
        hidden.delete(partId);
      } else {
        hidden.add(partId);
      }
      return { hidden };
    }),

  isolate: (partId, allPartIds) =>
    set({ hidden: new Set(allPartIds.filter((id) => id !== partId)) }),

  showAll: () => set({ hidden: new Set<string>() }),

  // Switching tools drops anything half finished rather than leaving a stray
  // first point to be picked up later by an unrelated click.
  //
  // Measuring also collapses the exploded view. Measurements are stored in CAD
  // coordinates while an exploded part is drawn away from where its data says
  // it is, so an exploded measurement would draw a line whose length disagreed
  // with its own label.
  setTool: (tool) =>
    set((state) => ({
      tool,
      pending: null,
      hover: null,
      ...(tool === 'measure' ? { explode: 0 } : {}),
      // A half-made section reference must not survive into another tool,
      // where the next click would be silently eaten by it.
      section: state.section.picking
        ? { ...state.section, picking: false, pickError: null }
        : state.section,
    })),

  setExplode: (explode) => set({ explode }),

  setSection: (patch) => set((state) => ({ section: { ...state.section, ...patch } })),

  setView: (name) => set({ requestedView: { name, at: Date.now() } }),

  // Changing what is being measured abandons a pick made towards the last
  // one: a face chosen for a distance is not the first half of an angle.
  setMeasureMode: (measureMode) =>
    set({ measureMode, pending: null, hover: null, measureError: null }),

  setMeasureUnit: (measureUnit) => set({ measureUnit }),

  setHover: (hover) => set({ hover }),

  addMeasurementPoint: (target) =>
    set((state) => {
      const spec = modeSpec(state.measureMode);

      // Modes that answer from a single pick never hold one: the reading
      // arrives on the click.
      const first = spec.picks === 1 ? target : state.pending;
      if (!first) {
        const check = measureInMode(state.measureMode, target);
        // The first of two picks still has to suit the mode. Finding out on
        // the second click means having wasted the first.
        return check.ok || check.reason.startsWith('Pick a second')
          ? { pending: target, measureError: null }
          : { measureError: check.reason };
      }

      const outcome = measureInMode(
        state.measureMode,
        first,
        spec.picks === 1 ? undefined : target,
      );

      if (!outcome.ok) {
        // The first pick is kept: the second one was wrong, not both.
        return { measureError: outcome.reason, pending: spec.picks === 1 ? null : first };
      }

      const measurement: Measurement = {
        id: `${Date.now()}-${state.measurements.length}`,
        ...outcome.result,
      };

      return {
        pending: null,
        measureError: null,
        measurements: [...state.measurements, measurement],
      };
    }),

  cancelPending: () => set({ pending: null }),

  removeMeasurement: (id) =>
    set((state) => ({
      measurements: state.measurements.filter((measurement) => measurement.id !== id),
    })),

  clearMeasurements: () => set({ measurements: [], pending: null }),

  reset: () => set(initialState()),
}));
