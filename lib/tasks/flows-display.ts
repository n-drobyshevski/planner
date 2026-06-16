// Pure display pipeline for the Flows side panel: filter -> sort -> group.
// No I/O, no current-time reads, no React — deterministic and unit-testable
// (mirrors lib/tasks/flows-layout.ts). The shell owns the `FlowsDisplay` state
// (persisted per collection); these functions turn the baseline lane list
// (from buildFlowLanes) into the ordered, grouped lanes the layout consumes.

import type { Board, Category, TaskRow } from "@/lib/types";
import type { FlowLane, LaneGroup } from "@/lib/tasks/flows-layout";
import { dateInputToUtcMs } from "@/lib/datetime/local";

/**
 * The lane's stored manual-order key, or null if it has never been hand-ordered.
 * Lives in the loose `attributes` bag so the global Flows order needs no schema.
 */
export function flowOrderOf(task: Pick<TaskRow, "attributes">): number | null {
  const v = task.attributes.flowPos;
  return typeof v === "number" ? v : null;
}

export type FlowsGroupBy = "none" | "status" | "category" | "priority";
export type FlowsSortBy =
  | "manual"
  | "start"
  | "due"
  | "title"
  | "priority"
  | "created";
export type SortDir = "asc" | "desc";

/**
 * Which lanes to show. A `null` array means "no constraint" (all). Tri-state
 * filters default to `"all"`. Priority uses 0 for "none" (task.priority null).
 */
export interface FlowsFilter {
  /** board (column/state) ids to keep; null = all */
  boardIds: string[] | null;
  /** category ids to keep; `null` entry = the "no category" bucket; outer null = all */
  categoryIds: (string | null)[] | null;
  /** priorities to keep (0..3, 0 = none); null = all */
  priorities: number[] | null;
  done: "all" | "open" | "done";
  milestone: "all" | "only" | "exclude";
  privacy: "all" | "private" | "shared";
}

export interface FlowsDisplay {
  filter: FlowsFilter;
  groupBy: FlowsGroupBy;
  sortBy: FlowsSortBy;
  sortDir: SortDir;
}

export const DEFAULT_FLOWS_FILTER: FlowsFilter = {
  boardIds: null,
  categoryIds: null,
  priorities: null,
  done: "all",
  milestone: "all",
  privacy: "all",
};

// Default mirrors the historical Flows ordering: no grouping, manual (= the
// open-first/by-time baseline from buildFlowLanes), so the view is unchanged
// until the user opens the Display menu.
export const DEFAULT_FLOWS_DISPLAY: FlowsDisplay = {
  filter: DEFAULT_FLOWS_FILTER,
  groupBy: "none",
  sortBy: "manual",
  sortDir: "asc",
};

/** Lookups + localized bucket labels the grouping needs. Pure data in. */
export interface FlowsDisplayCtx {
  boardsById: Map<string, Board>;
  /** boardId -> column index, for status group order */
  boardOrder: Map<string, number>;
  categoriesById: Map<string, Category>;
  labels: {
    noStatus: string;
    noCategory: string;
    /** 0..3 -> localized priority name */
    priority: Record<number, string>;
  };
}

const NONE = "none";

/** The priority bucket value for a task (null priority reads as 0 = "none"). */
function prio(task: { priority: number | null }): number {
  return task.priority ?? 0;
}

/** Keep only lanes matching the filter. Branches (subtasks) are never filtered. */
export function filterLanes(lanes: FlowLane[], f: FlowsFilter): FlowLane[] {
  return lanes.filter(({ task, done }) => {
    if (f.boardIds && !(task.boardId !== null && f.boardIds.includes(task.boardId)))
      return false;
    if (f.categoryIds && !f.categoryIds.includes(task.categoryId)) return false;
    if (f.priorities && !f.priorities.includes(prio(task))) return false;
    if (f.done === "open" && done) return false;
    if (f.done === "done" && !done) return false;
    if (f.milestone === "only" && !task.isMilestone) return false;
    if (f.milestone === "exclude" && task.isMilestone) return false;
    if (f.privacy === "private" && !task.isPrivate) return false;
    if (f.privacy === "shared" && task.isPrivate) return false;
    return true;
  });
}

/**
 * Order a list of lanes by the chosen key. `manual` sorts by the caller-supplied
 * anchor (the hand-arranged Flows order — `attributes.flowPos` falling back to
 * the baseline index); without one it preserves the input order. Every other key
 * sorts by its field with nulls always pushed last regardless of direction.
 * Stable.
 */
export function sortLanes(
  lanes: FlowLane[],
  sortBy: FlowsSortBy,
  dir: SortDir,
  manualAnchor?: (lane: FlowLane) => number,
): FlowLane[] {
  const arr = [...lanes];
  const mul = dir === "desc" ? -1 : 1;

  if (sortBy === "manual") {
    if (!manualAnchor) return arr; // preserve the caller's (baseline) order
    return arr.sort((a, b) => manualAnchor(a) - manualAnchor(b));
  }
  if (sortBy === "title") {
    return arr.sort((a, b) => mul * a.task.title.localeCompare(b.task.title));
  }

  const key = (l: FlowLane): number | null => {
    switch (sortBy) {
      case "start":
        return l.startMs;
      case "created":
        return l.task.createdAt;
      case "due":
        return l.task.dueDate ? dateInputToUtcMs(l.task.dueDate) : null;
      case "priority":
        return l.task.priority; // null = none -> sorts last
    }
  };
  return arr.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null && kb === null) return 0;
    if (ka === null) return 1; // nulls last
    if (kb === null) return -1;
    return mul * (ka - kb);
  });
}

function groupKeyOf(
  task: { boardId: string | null; categoryId: string | null; priority: number | null },
  groupBy: Exclude<FlowsGroupBy, "none">,
): string {
  if (groupBy === "status") return task.boardId ?? NONE;
  if (groupBy === "category") return task.categoryId ?? NONE;
  return String(prio(task)); // priority bucket "0".."3"
}

function groupLabelOf(
  key: string,
  groupBy: Exclude<FlowsGroupBy, "none">,
  ctx: FlowsDisplayCtx,
): string {
  if (groupBy === "status")
    return key === NONE ? ctx.labels.noStatus : ctx.boardsById.get(key)?.name ?? ctx.labels.noStatus;
  if (groupBy === "category")
    return key === NONE
      ? ctx.labels.noCategory
      : ctx.categoriesById.get(key)?.name ?? ctx.labels.noCategory;
  return ctx.labels.priority[Number(key)] ?? "";
}

function groupColorOf(
  key: string,
  groupBy: Exclude<FlowsGroupBy, "none">,
  ctx: FlowsDisplayCtx,
): string | undefined {
  // Only category carries a meaningful swatch; status/priority read by label
  // alone (never color-only).
  if (groupBy === "category" && key !== NONE) return ctx.categoriesById.get(key)?.color;
  return undefined;
}

/** Deterministic order of the group buckets themselves. The "none" bucket last. */
function groupOrder(
  key: string,
  groupBy: Exclude<FlowsGroupBy, "none">,
  ctx: FlowsDisplayCtx,
): number {
  if (key === NONE) return Number.MAX_SAFE_INTEGER;
  if (groupBy === "status") return ctx.boardOrder.get(key) ?? Number.MAX_SAFE_INTEGER - 1;
  if (groupBy === "category") return ctx.categoriesById.get(key)?.sortOrder ?? 0;
  return 3 - Number(key); // priority high (3) first
}

/**
 * Partition lanes into ordered groups, each internally ordered by `sortBy`. For
 * `groupBy: "none"` returns a single headerless group preserving the baseline
 * order when `sortBy` is manual (so the default view is unchanged).
 */
export function groupLanes(
  lanes: FlowLane[],
  groupBy: FlowsGroupBy,
  sortBy: FlowsSortBy,
  dir: SortDir,
  ctx: FlowsDisplayCtx,
  manualAnchor?: (lane: FlowLane) => number,
): LaneGroup[] {
  if (groupBy === "none") {
    return [
      { key: "all", label: "", lanes: sortLanes(lanes, sortBy, dir, manualAnchor), header: false },
    ];
  }

  const buckets = new Map<string, FlowLane[]>();
  for (const lane of lanes) {
    const key = groupKeyOf(lane.task, groupBy);
    const arr = buckets.get(key);
    if (arr) arr.push(lane);
    else buckets.set(key, [lane]);
  }

  return [...buckets.entries()]
    .map(([key, ls]) => ({
      key,
      label: groupLabelOf(key, groupBy, ctx),
      color: groupColorOf(key, groupBy, ctx),
      lanes: sortLanes(ls, sortBy, dir, manualAnchor),
      header: true,
    }))
    .sort((a, b) => groupOrder(a.key, groupBy, ctx) - groupOrder(b.key, groupBy, ctx));
}

/** Count of constrained filter dimensions — drives the Display trigger badge. */
export function activeFilterCount(f: FlowsFilter): number {
  let n = 0;
  if (f.boardIds) n++;
  if (f.categoryIds) n++;
  if (f.priorities) n++;
  if (f.done !== "all") n++;
  if (f.milestone !== "all") n++;
  if (f.privacy !== "all") n++;
  return n;
}
