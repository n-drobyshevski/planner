import { create } from "zustand";

/**
 * UI-only client state (ephemeral). The active view + focused date are URL-
 * driven and held locally in the calendar shell, not here. This store holds
 * selection + visibility toggles shared across the calendar surface.
 */
interface UiState {
  selectedEventKey: string | null;
  sidebarOpen: boolean;
  /** category ids explicitly hidden from the calendar */
  hiddenCategoryIds: Set<string>;
  /** layers toggled off: "shared" or a memberId */
  hiddenLayers: Set<string>;
  /** task selected for editing (tasks views) */
  selectedTaskId: string | null;
  /** the "Unscheduled tasks" rail on the calendar (T4) */
  taskBacklogOpen: boolean;

  setSelectedEventKey: (key: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleCategory: (id: string) => void;
  toggleLayer: (layer: string) => void;
  /** Replace the whole hidden-categories set (e.g. "show only this" / "show all"). */
  setHiddenCategoryIds: (next: Set<string>) => void;
  /** Replace the whole hidden-layers set (e.g. "show only this" / "show all"). */
  setHiddenLayers: (next: Set<string>) => void;
  setSelectedTaskId: (id: string | null) => void;
  setTaskBacklogOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedEventKey: null,
  sidebarOpen: true,
  hiddenCategoryIds: new Set(),
  hiddenLayers: new Set(),
  selectedTaskId: null,
  taskBacklogOpen: false,

  setSelectedEventKey: (selectedEventKey) => set({ selectedEventKey }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSelectedTaskId: (selectedTaskId) => set({ selectedTaskId }),
  setTaskBacklogOpen: (taskBacklogOpen) => set({ taskBacklogOpen }),
  toggleCategory: (id) =>
    set((s) => {
      const next = new Set(s.hiddenCategoryIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { hiddenCategoryIds: next };
    }),
  toggleLayer: (layer) =>
    set((s) => {
      const next = new Set(s.hiddenLayers);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return { hiddenLayers: next };
    }),
  setHiddenCategoryIds: (hiddenCategoryIds) => set({ hiddenCategoryIds }),
  setHiddenLayers: (hiddenLayers) => set({ hiddenLayers }),
}));
