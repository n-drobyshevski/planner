import { create } from "zustand";
import { DEFAULT_HOUR_PX, clampHourPx } from "@/lib/datetime/zoom-math";

/**
 * UI-only client state (ephemeral). The active view + focused date are URL-
 * driven and held locally in the calendar shell, not here. This store holds
 * selection + visibility toggles shared across the calendar surface.
 */
interface UiState {
  selectedEventKey: string | null;
  /**
   * Multi-selection of event keys (Shift+click on the time grid). Source of
   * truth for the ring highlight + bulk move/delete/recolor. A plain single
   * selection collapses this to a one-element set (see `setSelectedEventKey`).
   */
  selectedEventKeys: Set<string>;
  sidebarOpen: boolean;
  /** category ids explicitly hidden from the calendar */
  hiddenCategoryIds: Set<string>;
  /** other members' calendars overlaid onto my view (memberIds); own is always shown */
  overlayMemberIds: Set<string>;
  /** hide my own calendar's personal events; shared/joint events still show */
  ownCalendarHidden: boolean;
  /** blur every event title + task name across the calendar (Shift+M) */
  maskTitles: boolean;
  /** task selected for editing (tasks views) */
  selectedTaskId: string | null;
  /** the "Unscheduled tasks" rail on the calendar (T4) */
  taskBacklogOpen: boolean;
  /** Vertical time-grid scale (px per hour) — driven by Ctrl+wheel / pinch zoom. */
  hourPx: number;

  setSelectedEventKey: (key: string | null) => void;
  /** Replace the whole multi-selection set. */
  setSelectedEventKeys: (next: Set<string>) => void;
  /** Add/remove one key from the multi-selection (Shift+click). */
  toggleSelectedEventKey: (key: string) => void;
  /** Clear both the single selection and the multi-selection set. */
  clearSelection: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleCategory: (id: string) => void;
  /** Overlay / un-overlay another member's calendar. */
  toggleOverlay: (memberId: string) => void;
  /** Show / hide my own calendar (personal events). */
  toggleOwnCalendar: () => void;
  /** Blur / un-blur all event + task titles on the calendar (Shift+M). */
  toggleMaskTitles: () => void;
  /** Replace the whole hidden-categories set (e.g. "show only this" / "show all"). */
  setHiddenCategoryIds: (next: Set<string>) => void;
  /** Replace the whole overlaid-members set. */
  setOverlayMemberIds: (next: Set<string>) => void;
  setSelectedTaskId: (id: string | null) => void;
  setTaskBacklogOpen: (open: boolean) => void;
  /** Set the time-grid scale; clamped to the allowed zoom range. */
  setHourPx: (px: number) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedEventKey: null,
  selectedEventKeys: new Set(),
  sidebarOpen: false,
  hiddenCategoryIds: new Set(),
  overlayMemberIds: new Set(),
  ownCalendarHidden: false,
  maskTitles: false,
  selectedTaskId: null,
  taskBacklogOpen: false,
  hourPx: DEFAULT_HOUR_PX,

  // A plain selection is also the (size-1) multi-selection, so the grid's ring
  // highlight — which reads `selectedEventKeys` — always tracks single clicks.
  setSelectedEventKey: (selectedEventKey) =>
    set({
      selectedEventKey,
      selectedEventKeys: selectedEventKey ? new Set([selectedEventKey]) : new Set(),
    }),
  setSelectedEventKeys: (selectedEventKeys) => set({ selectedEventKeys }),
  toggleSelectedEventKey: (key) =>
    set((s) => {
      const next = new Set(s.selectedEventKeys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { selectedEventKeys: next };
    }),
  clearSelection: () => set({ selectedEventKey: null, selectedEventKeys: new Set() }),
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
  toggleOwnCalendar: () => set((s) => ({ ownCalendarHidden: !s.ownCalendarHidden })),
  toggleMaskTitles: () => set((s) => ({ maskTitles: !s.maskTitles })),
  setHiddenCategoryIds: (hiddenCategoryIds) => set({ hiddenCategoryIds }),
  setOverlayMemberIds: (overlayMemberIds) => set({ overlayMemberIds }),
  setHourPx: (px) => set({ hourPx: clampHourPx(px) }),
}));
