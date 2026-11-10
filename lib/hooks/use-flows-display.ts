"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_FLOWS_DISPLAY,
  coerceFlowsDisplay,
  type FlowsDisplay,
} from "@/lib/tasks/flows-display";

const PREFIX = "planner.flowsDisplay.";
const key = (collectionId: string) => `${PREFIX}${collectionId}`;

function read(collectionId: string | null): FlowsDisplay {
  if (collectionId === null || typeof window === "undefined") return DEFAULT_FLOWS_DISPLAY;
  try {
    const raw = window.localStorage.getItem(key(collectionId));
    return raw ? coerceFlowsDisplay(JSON.parse(raw)) : DEFAULT_FLOWS_DISPLAY;
  } catch {
    return DEFAULT_FLOWS_DISPLAY;
  }
}

/**
 * Per-collection Flows display settings, persisted in localStorage. The initial
 * value is read lazily (once); switching collections re-reads during render
 * (React's "adjust state on prop change" pattern, as in use-optimistic-order),
 * never in an effect, so the panel never paints a frame with the wrong
 * collection's settings. A single effect writes changes back.
 */
export function useFlowsDisplay(
  collectionId: string | null,
): [FlowsDisplay, (next: FlowsDisplay) => void, () => void] {
  const [display, setDisplay] = useState<FlowsDisplay>(() => read(collectionId));
  const [syncedId, setSyncedId] = useState(collectionId);

  if (collectionId !== syncedId) {
    setSyncedId(collectionId);
    setDisplay(read(collectionId));
  }

  useEffect(() => {
    if (collectionId === null || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key(collectionId), JSON.stringify(display));
    } catch {
      // storage full / unavailable (private mode) — settings stay session-local.
    }
  }, [collectionId, display]);

  const reset = () => setDisplay(DEFAULT_FLOWS_DISPLAY);
  return [display, setDisplay, reset];
}
