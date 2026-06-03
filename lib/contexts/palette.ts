// The selectable colors for a Context (category). Shared by the sidebar's
// "Add context" popover and the event form's inline "Create new context" dialog
// so contexts look consistent no matter where they're created. Rendered through
// toPaletteColor() so they re-tint with the active palette, like item colors.

export const CONTEXT_PALETTE = [
  "#c0492a",
  "#0f766e",
  "#b45309",
  "#15803d",
  "#0369a1",
  "#be185d",
  "#7c3aed",
] as const;
