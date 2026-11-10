import "server-only";
import type { Board, Category, Collection, Member, TaskRow } from "@/lib/types";
import type { AttentionMode } from "@/lib/tasks/attention";
import { buildFlowLanes } from "@/lib/tasks/flows-layout";
import {
  DEFAULT_FLOWS_FILTER,
  filterLanes,
  groupLanes,
  type FlowsDisplay,
  type FlowsDisplayCtx,
  type FlowsFilter,
  type FlowsGroupBy,
} from "@/lib/tasks/flows-display";
import { buildStreams, rankStreams } from "@/lib/tasks/flows-streams";
import { laneAttention } from "@/lib/tasks/attention";
import { groupByParent, progressDeep } from "@/lib/tasks/tree";
import { clipTitle } from "./projection";

/** The groupings `get_flows` offers ("none" is the web app's headerless mode, not a stream split). */
export type McpFlowsGroupBy = Exclude<FlowsGroupBy, "none">;
export const MCP_FLOWS_GROUP_BYS = [
  "tag",
  "category",
  "collection",
  "assignee",
  "status",
  "priority",
] as const satisfies readonly McpFlowsGroupBy[];

/** Streams returned at most; more than this and the output is cut to the top-ranked. */
export const MAX_STREAMS = 30;

export interface FlowTaskOut {
  id: string;
  title: string;
  /** when the task's runway begins: its planned start, else its first activity ("yyyy-MM-dd") */
  start?: string;
  dueDate?: string;
  /** subtasks done / total, over the whole subtree; absent when it has none */
  progress?: { done: number; total: number };
  priority?: number;
  score: number;
  overdue: boolean;
  tags?: string[];
}

export interface FlowStreamOut {
  key: string;
  label: string;
  open: number;
  done: number;
  overdue: number;
  needsAttention: number;
  nextDue?: string;
  score: number;
  tasks: FlowTaskOut[];
}

export interface FlowsOut {
  date: string;
  groupBy: McpFlowsGroupBy;
  attention: AttentionMode;
  stream?: string;
  streams: FlowStreamOut[];
  truncated?: true;
}

export interface FlowsInput {
  /** every task the caller can see (RLS-scoped), subtasks included */
  tasks: TaskRow[];
  boards: Board[];
  categories: Category[];
  collections: Collection[];
  members: Member[];
  memberId: string;
  /** the caller's local today, "yyyy-MM-dd" */
  date: string;
  nowMs: number;
  groupBy: McpFlowsGroupBy;
  attention: AttentionMode;
  /** only top-level tasks the caller owns or is assigned to */
  mine: boolean;
  /** tasks returned per stream */
  limit: number;
  /** a saved stream's filter; default = everything */
  filter?: FlowsFilter;
  /** echoed back as `stream` */
  streamName?: string;
}

/** Plain English: this output is read by a machine/LLM, not localized. */
const LABELS: FlowsDisplayCtx["labels"] = {
  noStatus: "No status",
  noCategory: "No category",
  noTag: "No tag",
  noCollection: "No collection",
  unassigned: "Unassigned",
  priority: { 0: "No priority", 1: "Low", 2: "Medium", 3: "High" },
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

function progressOf(
  taskId: string,
  byParent: Map<string | null, TaskRow[]>,
): Pick<FlowTaskOut, "progress"> {
  const { done, total } = progressDeep(taskId, byParent);
  return total > 0 ? { progress: { done, total } } : {};
}

/**
 * Resolve the effective options of a `get_flows` call. A saved stream's
 * definition supplies filter, groupBy and attention; explicit arguments win.
 * A saved `groupBy: "none"` (one ungrouped lane list) has no stream split to
 * report, so it falls back to the default, "tag".
 */
export function resolveFlowOptions(
  args: { groupBy?: McpFlowsGroupBy; attention?: AttentionMode },
  saved?: FlowsDisplay,
): { groupBy: McpFlowsGroupBy; attention: AttentionMode; filter: FlowsFilter } {
  const savedGroup = saved && saved.groupBy !== "none" ? saved.groupBy : undefined;
  return {
    groupBy: args.groupBy ?? savedGroup ?? "tag",
    attention: args.attention ?? saved?.attention ?? "combined",
    filter: saved?.filter ?? DEFAULT_FLOWS_FILTER,
  };
}

/**
 * Project the caller's tasks into `get_flows`' streams, on the same pure
 * pipeline the web app's Streams view uses (buildFlowLanes -> filterLanes ->
 * groupLanes -> buildStreams -> rankStreams) so the numbers agree. Status
 * events are not needed: attention reads only a task's due date, priority and
 * completion, none of which come from the event history (an empty events map
 * just gives each lane a birth node). A subtask raises its parent's attention
 * (laneAttention). Pure: no I/O, no clock. Never reads a task description.
 */
export function projectFlows(input: FlowsInput): FlowsOut {
  const { date, groupBy, attention, nowMs } = input;

  const byParent = groupByParent(input.tasks);
  const topLevel = (byParent.get(null) ?? []).filter(
    (t) => !input.mine || t.ownerId === input.memberId || t.assigneeId === input.memberId,
  );

  const lanes = buildFlowLanes({
    topLevel,
    childrenByParent: byParent,
    eventsByTask: new Map(),
    nowMs,
  });
  const filtered = filterLanes(lanes, input.filter ?? DEFAULT_FLOWS_FILTER);

  const ctx: FlowsDisplayCtx = {
    boardsById: new Map(input.boards.map((b) => [b.id, b])),
    boardOrder: new Map(input.boards.map((b, i) => [b.id, i])),
    categoriesById: new Map(input.categories.map((c) => [c.id, c])),
    collectionsById: new Map(input.collections.map((c) => [c.id, c])),
    collectionOrder: new Map(input.collections.map((c, i) => [c.id, i])),
    membersById: new Map(input.members.map((m) => [m.id, m])),
    memberOrder: new Map(input.members.map((m, i) => [m.id, i])),
    today: date,
    attention,
    labels: LABELS,
  };

  const groups = groupLanes(filtered, groupBy, "manual", "asc", ctx);
  const ranked = rankStreams(buildStreams(groups, { nowMs, today: date, mode: attention }));

  const out: FlowStreamOut[] = ranked.slice(0, MAX_STREAMS).map((s) => {
    const tasks = s.lanes
      .filter((l) => !l.done)
      .map((l) => ({ lane: l, info: laneAttention(l, date, attention) }))
      .sort((a, b) => {
        if (a.info.score !== b.info.score) return b.info.score - a.info.score;
        // Equal pressure: the sooner deadline first, undated last.
        const da = a.info.daysToDue;
        const db = b.info.daysToDue;
        if (da === db) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      })
      .slice(0, input.limit)
      .map(({ lane, info }): FlowTaskOut => {
        const t = lane.task;
        return {
          id: t.id,
          title: clipTitle(t.title),
          start: new Date(lane.startMs).toISOString().slice(0, 10),
          ...(t.dueDate ? { dueDate: t.dueDate } : {}),
          ...progressOf(t.id, byParent),
          ...(t.priority != null ? { priority: t.priority } : {}),
          score: round2(info.score),
          overdue: info.overdue,
          ...(t.tags.length > 0 ? { tags: t.tags } : {}),
        };
      });
    return {
      key: s.key,
      label: s.label,
      open: s.open,
      done: s.done,
      overdue: s.overdue,
      needsAttention: s.attentionCount,
      ...(s.nextDue ? { nextDue: s.nextDue } : {}),
      score: round2(s.attention.score),
      tasks,
    };
  });

  return {
    date,
    groupBy,
    attention,
    ...(input.streamName !== undefined ? { stream: input.streamName } : {}),
    streams: out,
    ...(ranked.length > MAX_STREAMS ? { truncated: true as const } : {}),
  };
}

// -- one task, for editing ------------------------------------------------------

export interface TaskDetailSubtask {
  id: string;
  title: string;
  done: boolean;
  /** 1 = a direct child */
  depth: number;
}

export interface TaskDetailOut {
  id: string;
  title: string;
  done: boolean;
  dueDate?: string;
  startDate?: string;
  priority?: number;
  tags: string[];
  /** the whole subtree, parent before child, siblings in their stored order */
  subtasks: TaskDetailSubtask[];
}

/** How deep a subtree `get_task` walks, and how many subtasks it returns at most. */
const DETAIL_MAX_DEPTH = 6;
const DETAIL_MAX_SUBTASKS = 100;

/**
 * `get_task`'s output: the fields the Flows app edits, and the subtask tree
 * flattened pre-order. Pure. Never reads a description.
 */
export function projectTaskDetail(task: TaskRow, all: TaskRow[]): TaskDetailOut {
  const byParent = groupByParent(all);
  const subtasks: TaskDetailSubtask[] = [];
  const seen = new Set<string>([task.id]);
  const walk = (parentId: string, depth: number) => {
    if (depth > DETAIL_MAX_DEPTH) return;
    const kids = [...(byParent.get(parentId) ?? [])].sort((a, b) => a.position - b.position);
    for (const kid of kids) {
      if (seen.has(kid.id) || subtasks.length >= DETAIL_MAX_SUBTASKS) continue;
      seen.add(kid.id);
      subtasks.push({ id: kid.id, title: clipTitle(kid.title), done: kid.completedAt != null, depth });
      walk(kid.id, depth + 1);
    }
  };
  walk(task.id, 1);
  return {
    id: task.id,
    title: task.title,
    done: task.completedAt != null,
    ...(task.dueDate ? { dueDate: task.dueDate } : {}),
    ...(task.startDate ? { startDate: task.startDate } : {}),
    ...(task.priority != null ? { priority: task.priority } : {}),
    tags: task.tags,
    subtasks,
  };
}
