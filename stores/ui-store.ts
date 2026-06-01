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
  /** other members' calendars overlaid onto my view (memberIds); own is always shown */
  overlayMemberIds: Set<string>;
  /** task selected for editing (tasks views) */
  selectedTaskId: string | null;
  /** the "Unscheduled tasks" rail on the calendar (T4) */
  taskBacklogOpen: boolean;

  setSelectedEventKey: (key: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleCategory: (id: string) => void;
  /** Overlay / un-overlay another member's calendar. */
  toggleOverlay: (memberId: string) => void;
  /** Replace the whole hidden-categories set (e.g. "show only this" / "show all"). */
  setHiddenCategoryIds: (next: Set<string>) => void;
  /** Replace the whole overlaid-members set. */
  setOverlayMemberIds: (next: Set<string>) => void;
  setSelectedTaskId: (id: string | null) => void;
  setTaskBacklogOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedEventKey: null,
  sidebarOpen: true,
  hiddenCategoryIds: new Set(),
  overlayMemberIds: new Set(),
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
  toggleOverlay: (memberId) =>
    set((s) => {
      const next = new Set(s.overlayMemberIds);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return { overlayMemberIds: next };
    }),
  setHiddenCategoryIds: (hiddenCategoryIds) => set({ hiddenCategoryIds }),
  setOverlayMemberIds: (overlayMemberIds) => set({ overlayMemberIds }),
}));
