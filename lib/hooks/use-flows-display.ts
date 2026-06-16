"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_FLOWS_DISPLAY,
  DEFAULT_FLOWS_FILTER,
  type FlowsDisplay,
  type FlowsFilter,
  type FlowsGroupBy,
  type FlowsSortBy,
  type SortDir,
} from "@/lib/tasks/flows-display";

const PREFIX = "planner.flowsDisplay.";
const key = (collectionId: string) => `${PREFIX}${collectionId}`;

const GROUP_BYS: FlowsGroupBy[] = ["none", "status", "category", "priority"];
const SORT_BYS: FlowsSortBy[] = ["manual", "start", "due", "title", "priority", "created"];

/**
 * Validate a parsed blob into a FlowsDisplay, falling back to the default for
 * any missing / wrong-shaped field. Stale or old-schema localStorage never
 * crashes the view — at worst a field resets to its default.
 */
function coerce(raw: unknown): FlowsDisplay {
  if (!raw || typeof raw !== "object") return DEFAULT_FLOWS_DISPLAY;
  const o = raw as Record<string, unknown>;
  const f = (o.filter ?? {}) as Record<string, unknown>;
  const strArr = (v: unknown): string[] | null =>
    Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;
  const catArr = (v: unknown): (string | null)[] | null =>
    Array.isArray(v) && v.every((x) => typeof x === "string" || x === null)
      ? (v as (string | null)[])
      : null;
  const numArr = (v: unknown): number[] | null =>
    Array.isArray(v) && v.every((x) => typeof x === "number") ? (v as number[]) : null;
  const tri = <T extends string>(v: unknown, allowed: T[], dflt: T): T =>
    typeof v === "string" && (allowed as string[]).includes(v) ? (v as T) : dflt;

  const filter: FlowsFilter = {
    boardIds: "boardIds" in f ? strArr(f.boardIds) : null,
    categoryIds: "categoryIds" in f ? catArr(f.categoryIds) : null,
    priorities: "priorities" in f ? numArr(f.priorities) : null,
    done: tri(f.done, ["all", "open", "done"], DEFAULT_FLOWS_FILTER.done),
    milestone: tri(f.milestone, ["all", "only", "exclude"], DEFAULT_FLOWS_FILTER.milestone),
    privacy: tri(f.privacy, ["all", "private", "shared"], DEFAULT_FLOWS_FILTER.privacy),
  };
  return {
    filter,
    groupBy: tri(o.groupBy, GROUP_BYS, DEFAULT_FLOWS_DISPLAY.groupBy),
    sortBy: tri(o.sortBy, SORT_BYS, DEFAULT_FLOWS_DISPLAY.sortBy),
    sortDir: tri<SortDir>(o.sortDir, ["asc", "desc"], DEFAULT_FLOWS_DISPLAY.sortDir),
  };
}

function read(collectionId: string | null): FlowsDisplay {
  if (collectionId === null || typeof window === "undefined") return DEFAULT_FLOWS_DISPLAY;
  try {
    const raw = window.localStorage.getItem(key(collectionId));
    return raw ? coerce(JSON.parse(raw)) : DEFAULT_FLOWS_DISPLAY;
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
