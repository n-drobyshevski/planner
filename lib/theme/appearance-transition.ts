"use client";

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => unknown;
};

/**
 * Run an appearance change (the DOM mutation that re-tints `<html>` — data
 * attributes and/or the next-themes `.dark` class) inside a native View
 * Transition, so the browser snapshots before/after and crossfades the whole
 * document between the old and new colors instead of hard-cutting.
 *
 * Progressive enhancement: where the View Transitions API is missing (Firefox,
 * older Safari) or the user prefers reduced motion, the change is applied
 * instantly — exactly today's behavior. The callback must apply the visual
 * change *synchronously* (the next-themes path wraps `setTheme` in `flushSync`)
 * so the browser captures the updated state in its "after" snapshot.
 */
export function withAppearanceTransition(apply: () => void): void {
  if (typeof document === "undefined") {
    apply();
    return;
  }
  const doc = document as ViewTransitionDocument;
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (typeof doc.startViewTransition !== "function" || reduced) {
    apply();
    return;
  }
  doc.startViewTransition(apply);
}
