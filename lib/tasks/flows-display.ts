// Pure display pipeline for the Flows side panel: filter -> sort -> group.
// No I/O, no current-time reads, no React — deterministic and unit-testable
// (mirrors lib/tasks/flows-layout.ts). The shell owns the `FlowsDisplay` state
// (persisted per collection); these functions turn the baseline lane list
// (from buildFlowLanes) into the ordered, grouped lanes the layout consumes.

import type { Board, Category, Collection, Member, TaskRow } from "@/lib/types";
import type { FlowLane, LaneGroup } from "@/lib/tasks/flows-layout";
import { dateInputToUtcMs } from "@/lib/datetime/local";
import { ATTENTION_MODES, laneAttention, type AttentionMode } from "@/lib/tasks/attention";

/**
 * The lane's stored manual-order key, or null if it has never been hand-ordered.
 * Lives in the loose `attributes` bag so the global Flows order needs no schema.
 */
export function flowOrderOf(task: Pick<TaskRow, "attributes">): number | null {
  const v = task.attributes.flowPos;
  return typeof v === "number" ? v : null;
}

export type FlowsGroupBy =
  | "none"
  | "status"
  | "category"
  | "priority"
  | "tag"
  | "collection"
  | "assignee";
export type FlowsSortBy =
  | "manual"
  | "start"
  | "due"
  | "title"
  | "priority"
  | "created"
  | "attention";
export const FLOWS_GROUP_BYS: FlowsGroupBy[] = [
  "none",
  "status",
  "category",
  "priority",
  "tag",
  "collection",
  "assignee",
];
export const FLOWS_SORT_BYS: FlowsSortBy[] = [
  "manual",
  "start",
  "due",
  "title",
  "priority",
  "created",
  "attention",
];
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
  /** tags to keep (a lane matches if it has ANY); `null` entry = untagged; outer null = all */
  tags: (string | null)[] | null;
  /** assignee member ids to keep; `null` entry = unassigned; outer null = all */
  assigneeIds: (string | null)[] | null;
  done: "all" | "open" | "done";
  milestone: "all" | "only" | "exclude";
  privacy: "all" | "private" | "shared";
}

export interface FlowsDisplay {
  filter: FlowsFilter;
  groupBy: FlowsGroupBy;
  sortBy: FlowsSortBy;
  sortDir: SortDir;
  /** one lane per task, or one collapsed lane per group */
  mode: FlowsMode;
  /** how "needs attention" is scored (attention sort + streams) */
  attention: AttentionMode;
  /**
   * Which tasks the UI feeds in: the active collection's, or every collection's.
   * The pipeline itself ignores it; it only travels with the persisted settings.
   */
  scope: FlowsScope;
  /** how a lane draws: a bar from start to deadline ("runway"), or a thin trunk line */
  laneStyle: FlowsLaneStyle;
}

export type FlowsLaneStyle = "line" | "runway";
export const FLOWS_LANE_STYLES: FlowsLaneStyle[] = ["runway", "line"];
export type FlowsMode = "tasks" | "streams";
export type FlowsScope = "collection" | "all";
export const FLOWS_MODES: FlowsMode[] = ["tasks", "streams"];
export const FLOWS_SCOPES: FlowsScope[] = ["collection", "all"];

export const DEFAULT_FLOWS_FILTER: FlowsFilter = {
  boardIds: null,
  categoryIds: null,
  priorities: null,
  tags: null,
  assigneeIds: null,
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
  mode: "tasks",
  attention: "combined",
  scope: "collection",
  laneStyle: "runway",
};

/** Lookups + localized bucket labels the grouping needs. Pure data in. */
export interface FlowsDisplayCtx {
  boardsById: Map<string, Board>;
  /** boardId -> column index, for status group order */
  boardOrder: Map<string, number>;
  categoriesById: Map<string, Category>;
  collectionsById: Map<string, Collection>;
  /** collectionId -> display index, for collection group order */
  collectionOrder: Map<string, number>;
  membersById: Map<string, Member>;
  /** memberId -> display index, for assignee group order */
  memberOrder: Map<string, number>;
  /** the viewer's calendar day ("yyyy-MM-dd"), for the attention sort */
  today: string;
  attention: AttentionMode;
  labels: {
    noStatus: string;
    noCategory: string;
    noTag: string;
    noCollection: string;
    unassigned: string;
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
    if (f.tags) {
      const hit =
        task.tags.length === 0 ? f.tags.includes(null) : task.tags.some((t) => f.tags!.includes(t));
      if (!hit) return false;
    }
    if (f.assigneeIds && !f.assigneeIds.includes(task.assigneeId)) return false;
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
 * `attention` is the exception: it has no nulls, and "desc" means most pressing
 * first (highest score, ties by soonest due), "asc" the reverse; it needs `attn`
 * (today + mode) and falls back to the input order without it. Stable.
 */
export function sortLanes(
  lanes: FlowLane[],
  sortBy: FlowsSortBy,
  dir: SortDir,
  manualAnchor?: (lane: FlowLane) => number,
  attn?: { today: string; mode: AttentionMode },
): FlowLane[] {
  const arr = [...lanes];
  const mul = dir === "desc" ? -1 : 1;

  if (sortBy === "attention") {
    if (!attn) return arr;
    const info = new Map(arr.map((l) => [l, laneAttention(l, attn.today, attn.mode)]));
    return arr.sort((a, b) => {
      const ia = info.get(a)!;
      const ib = info.get(b)!;
      if (ia.score !== ib.score) return mul * (ia.score - ib.score);
      // Equal pressure: the sooner deadline reads first in either direction.
      if (ia.daysToDue === ib.daysToDue) return 0;
      if (ia.daysToDue === null) return 1;
      if (ib.daysToDue === null) return -1;
      return ia.daysToDue - ib.daysToDue;
    });
  }

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
      default:
        return null;
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

/** Tag buckets are prefixed so a tag literally named "none" can't hit the untagged bucket. */
const TAG_PREFIX = "tag:";

/** Bucket keys a task belongs to. Only tag grouping can yield several. */
function groupKeysOf(
  task: TaskRow,
  groupBy: Exclude<FlowsGroupBy, "none">,
): string[] {
  if (groupBy === "status") return [task.boardId ?? NONE];
  if (groupBy === "category") return [task.categoryId ?? NONE];
  if (groupBy === "collection") return [task.collectionId ?? NONE];
  if (groupBy === "assignee") return [task.assigneeId ?? NONE];
  if (groupBy === "tag")
    return task.tags.length ? task.tags.map((t) => TAG_PREFIX + t) : [NONE];
  return [String(prio(task))]; // priority bucket "0".."3"
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
  if (groupBy === "tag") return key === NONE ? ctx.labels.noTag : key.slice(TAG_PREFIX.length);
  if (groupBy === "collection")
    return key === NONE
      ? ctx.labels.noCollection
      : ctx.collectionsById.get(key)?.name ?? ctx.labels.noCollection;
  if (groupBy === "assignee")
    return key === NONE
      ? ctx.labels.unassigned
      : ctx.membersById.get(key)?.name ?? ctx.labels.unassigned;
  return ctx.labels.priority[Number(key)] ?? "";
}

function groupColorOf(
  key: string,
  groupBy: Exclude<FlowsGroupBy, "none">,
  ctx: FlowsDisplayCtx,
): string | undefined {
  // Category and assignee carry a meaningful swatch (the member's own color);
  // the rest read by label alone (never color-only).
  if (key === NONE) return undefined;
  if (groupBy === "category") return ctx.categoriesById.get(key)?.color;
  if (groupBy === "assignee") return ctx.membersById.get(key)?.color;
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
  if (groupBy === "collection")
    return (
      ctx.collectionOrder.get(key) ??
      ctx.collectionsById.get(key)?.sortOrder ??
      Number.MAX_SAFE_INTEGER - 1
    );
  if (groupBy === "assignee") return ctx.memberOrder.get(key) ?? Number.MAX_SAFE_INTEGER - 1;
  if (groupBy === "tag") return 0; // ordered alphabetically by the caller
  return 3 - Number(key); // priority high (3) first
}

/**
 * Partition lanes into ordered groups, each internally ordered by `sortBy`. For
 * `groupBy: "none"` returns a single headerless group preserving the baseline
 * order when `sortBy` is manual (so the default view is unchanged). Grouping by
 * tag puts a multi-tag lane in EACH of its tag buckets (the same lane object
 * appears in several groups); untagged lanes fall into a trailing bucket.
 */
export function groupLanes(
  lanes: FlowLane[],
  groupBy: FlowsGroupBy,
  sortBy: FlowsSortBy,
  dir: SortDir,
  ctx: FlowsDisplayCtx,
  manualAnchor?: (lane: FlowLane) => number,
): LaneGroup[] {
  const attn = { today: ctx.today, mode: ctx.attention };
  if (groupBy === "none") {
    return [
      {
        key: "all",
        label: "",
        lanes: sortLanes(lanes, sortBy, dir, manualAnchor, attn),
        header: false,
      },
    ];
  }

  const buckets = new Map<string, FlowLane[]>();
  for (const lane of lanes) {
    for (const key of groupKeysOf(lane.task, groupBy)) {
      const arr = buckets.get(key);
      if (arr) arr.push(lane);
      else buckets.set(key, [lane]);
    }
  }

  return [...buckets.entries()]
    .map(([key, ls]) => ({
      key,
      label: groupLabelOf(key, groupBy, ctx),
      color: groupColorOf(key, groupBy, ctx),
      lanes: sortLanes(ls, sortBy, dir, manualAnchor, attn),
      header: true,
    }))
    .sort(
      (a, b) =>
        groupOrder(a.key, groupBy, ctx) - groupOrder(b.key, groupBy, ctx) ||
        (groupBy === "tag" ? a.label.localeCompare(b.label) : 0),
    );
}

/** Count of constrained filter dimensions — drives the Display trigger badge. */
export function activeFilterCount(f: FlowsFilter): number {
  let n = 0;
  if (f.boardIds) n++;
  if (f.categoryIds) n++;
  if (f.priorities) n++;
  if (f.tags) n++;
  if (f.assigneeIds) n++;
  if (f.done !== "all") n++;
  if (f.milestone !== "all") n++;
  if (f.privacy !== "all") n++;
  return n;
}

// --- persistence coercion ---------------------------------------------------

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], dflt: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : dflt;
const strArr = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;
const nullableStrArr = (v: unknown): (string | null)[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === "string" || x === null)
    ? (v as (string | null)[])
    : null;
const numArr = (v: unknown): number[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === "number") ? (v as number[]) : null;

/**
 * Validate a parsed blob (e.g. from localStorage) into a FlowsDisplay, falling
 * back to the default for any missing or wrong-shaped field. Stale or
 * old-schema data never crashes the view — at worst a field resets. Never throws.
 */
export function coerceFlowsDisplay(raw: unknown): FlowsDisplay {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_FLOWS_DISPLAY;
  const o = raw as Record<string, unknown>;
  const f: Record<string, unknown> =
    o.filter && typeof o.filter === "object" ? (o.filter as Record<string, unknown>) : {};

  const filter: FlowsFilter = {
    boardIds: strArr(f.boardIds),
    categoryIds: nullableStrArr(f.categoryIds),
    priorities: numArr(f.priorities),
    tags: nullableStrArr(f.tags),
    assigneeIds: nullableStrArr(f.assigneeIds),
    done: oneOf(f.done, ["all", "open", "done"], DEFAULT_FLOWS_FILTER.done),
    milestone: oneOf(f.milestone, ["all", "only", "exclude"], DEFAULT_FLOWS_FILTER.milestone),
    privacy: oneOf(f.privacy, ["all", "private", "shared"], DEFAULT_FLOWS_FILTER.privacy),
  };
  return {
    filter,
    groupBy: oneOf(o.groupBy, FLOWS_GROUP_BYS, DEFAULT_FLOWS_DISPLAY.groupBy),
    sortBy: oneOf(o.sortBy, FLOWS_SORT_BYS, DEFAULT_FLOWS_DISPLAY.sortBy),
    sortDir: oneOf<SortDir>(o.sortDir, ["asc", "desc"], DEFAULT_FLOWS_DISPLAY.sortDir),
    mode: oneOf(o.mode, FLOWS_MODES, DEFAULT_FLOWS_DISPLAY.mode),
    attention: oneOf(o.attention, ATTENTION_MODES, DEFAULT_FLOWS_DISPLAY.attention),
    scope: oneOf(o.scope, FLOWS_SCOPES, DEFAULT_FLOWS_DISPLAY.scope),
    laneStyle: oneOf(o.laneStyle, FLOWS_LANE_STYLES, DEFAULT_FLOWS_DISPLAY.laneStyle),
  };
}
