import * as THREE from 'three';
import { create } from 'zustand';

import type { SectionAxis } from '@/lib/section';
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
  distance: number;
  /** What each end snapped to, so a reader can tell corner from surface. */
  fromLabel: string;
  toLabel: string;
}

export interface SectionState {
  enabled: boolean;
  axis: SectionAxis;
  /** 0..1 across the model's bounding box on that axis, not a world value. */
  position: number;
  /** Which half of the model the plane keeps. */
  flipped: boolean;
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

  setHover: (target: SnapTarget | null) => void;
  addMeasurementPoint: (target: SnapTarget) => void;
  cancelPending: () => void;
  removeMeasurement: (id: string) => void;
  clearMeasurements: () => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  hidden: new Set<string>(),
  selected: null,
  selectedFace: null,
  tool: 'select',
  explode: 0,

  section: { enabled: false, axis: 'z', position: 0.5, flipped: false },

  hover: null,
  pending: null,
  measurements: [],

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
    set(tool === 'measure' ? { tool, pending: null, hover: null, explode: 0 } : { tool, pending: null, hover: null }),

  setExplode: (explode) => set({ explode }),

  setSection: (patch) => set((state) => ({ section: { ...state.section, ...patch } })),

  setHover: (hover) => set({ hover }),

  addMeasurementPoint: (target) =>
    set((state) => {
      if (!state.pending) return { pending: target };

      const measurement: Measurement = {
        id: `${Date.now()}-${state.measurements.length}`,
        from: state.pending.point.clone(),
        to: target.point.clone(),
        distance: state.pending.point.distanceTo(target.point),
        fromLabel: state.pending.label,
        toLabel: target.label,
      };

      return { pending: null, measurements: [...state.measurements, measurement] };
    }),

  cancelPending: () => set({ pending: null }),

  removeMeasurement: (id) =>
    set((state) => ({
      measurements: state.measurements.filter((measurement) => measurement.id !== id),
    })),

  clearMeasurements: () => set({ measurements: [], pending: null }),
}));
