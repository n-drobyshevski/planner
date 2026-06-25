// One-time discoverability nudge: the first time someone drag-moves an event
// (without already holding a modifier), we surface that Ctrl-drag duplicates and
// Alt-drag acts on the whole series — the "quiet power" shortcuts that otherwise
// only live in the `?` sheet. `localStorage` (not session) so the tip is shown
// once per device, ever. Every access is wrapped: storage throws in private-mode
// Safari and is absent during SSR.

const KEY = "planner:calendar:drag-modifiers-hint-seen";

export function dragModifierHintSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    // Storage unavailable: treat as seen so we never nag in a loop.
    return true;
  }
}

export function markDragModifierHintSeen(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // best-effort; a failed write just means the tip may appear again later
  }
}
