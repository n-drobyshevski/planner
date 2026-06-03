"use client";

import { useEffect } from "react";
import { useHistoryStore } from "@/stores/history-store";
import { useNotify } from "@/lib/hooks/use-notify";

/**
 * Global Ctrl+Z / Cmd+Z listener. Mounted once (in providers) so undo works on
 * every view. Pops the newest history entry and runs its inverse, then confirms
 * with a toast. Shift+Z is reserved for a future redo.
 *
 * Guards mirror the calendar grid's keydown handler: ignore keystrokes while
 * typing in a field, and while a Radix dialog/sheet is open (detected from the
 * DOM, since this listener can't see each view's React dialog state).
 */
export function UndoHotkey() {
  const runUndo = useHistoryStore((s) => s.runUndo);
  const { success: notifySuccess } = useNotify();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z") return;

      const ae = document.activeElement;
      if (
        ae instanceof HTMLElement &&
        (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)
      )
        return;

      // Don't hijack undo while a dialog/sheet/alert is open (Radix sets these).
      if (
        document.querySelector(
          "[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open']",
        )
      )
        return;

      e.preventDefault();
      void runUndo().then((label) => {
        if (label) notifySuccess(`Undone: ${label}`);
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runUndo, notifySuccess]);

  return null;
}
