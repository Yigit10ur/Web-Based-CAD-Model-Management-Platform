import { create } from 'zustand';

/**
 * Viewer state lives here, not in the scene graph.
 *
 * Visibility, selection and colour are read by R3F components from this store.
 * Keeping them out of the three.js objects is what stops the assembly tree and
 * the scene from drifting apart. See ARCHITECTURE.md section 6.
 */

export type ViewerTool = 'none' | 'measure' | 'section' | 'markup';

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

  select: (partId: string | null, face?: number | null) => void;
  toggleVisibility: (partId: string) => void;
  isolate: (partId: string, allPartIds: string[]) => void;
  showAll: () => void;
  setTool: (tool: ViewerTool) => void;
  setExplode: (value: number) => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  hidden: new Set<string>(),
  selected: null,
  selectedFace: null,
  tool: 'none',
  explode: 0,

  select: (partId, face = null) => set({ selected: partId, selectedFace: face }),

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

  setTool: (tool) => set({ tool }),

  setExplode: (explode) => set({ explode }),
}));
