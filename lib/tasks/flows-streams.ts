// Stream summaries for the collapsed "streams" Flows mode: one line per group
// of lanes, with the counts and deadline facts that line needs. Pure (no clock;
// `nowMs`/`today` are passed in). Type-only imports from flows-layout keep the
// layout <-> streams relationship cycle-free at runtime.

import type { FlowLane, FlowNode, LaneGroup } from "@/lib/tasks/flows-layout";
import {
  NO_ATTENTION,
  laneAttention,
  needsAttention,
  type AttentionInfo,
  type AttentionMode,
} from "@/lib/tasks/attention";

export interface StreamSummary {
  key: string;
  label: string;
  color?: string;
  lanes: FlowLane[];
  /** earliest lane start */
  startMs: number;
  /** null while any lane is still open, else the latest end */
  endMs: number | null;
  /** open / finished lane counts */
  open: number;
  done: number;
  /** open lanes past their due date */
  overdue: number;
  /** open lanes at or above the attention bar */
  attentionCount: number;
  /** the strongest open lane's attention */
  attention: AttentionInfo;
  /** earliest due date among open tasks (overdue included), "yyyy-MM-dd" */
  nextDue: string | null;
  /** the collapsed line's markers: open lanes' due dates + finished lanes' done nodes */
  nodes: FlowNode[];
}

export interface StreamOpts {
  nowMs: number;
  today: string;
  mode: AttentionMode;
}

function summarize(group: LaneGroup, opts: StreamOpts): StreamSummary {
  const { lanes } = group;
  const openLanes = lanes.filter((l) => !l.done);

  let attention = NO_ATTENTION;
  let overdue = 0;
  let attentionCount = 0;
  let nextDue: string | null = null;
  for (const lane of openLanes) {
    const info = laneAttention(lane, opts.today, opts.mode);
    if (info.score > attention.score) attention = info; // first strongest wins ties
    if (info.overdue) overdue++;
    if (needsAttention(info.score)) attentionCount++;
    for (const t of [lane.task, ...lane.branches.map((b) => b.task)]) {
      // "yyyy-MM-dd" tokens compare correctly as strings.
      if (t.completedAt == null && t.dueDate && (nextDue === null || t.dueDate < nextDue)) {
        nextDue = t.dueDate;
      }
    }
  }

  const nodes: FlowNode[] = [];
  for (const lane of lanes) {
    if (lane.done) {
      for (const n of lane.nodes) if (n.kind === "done") nodes.push(n);
    } else {
      for (const n of lane.nodes) if (n.kind === "due") nodes.push(n);
    }
  }
  nodes.sort((a, b) => a.ms - b.ms);

  const startMs = lanes.length ? Math.min(...lanes.map((l) => l.startMs)) : opts.nowMs;
  const endMs =
    openLanes.length > 0
      ? null
      : lanes.length
        ? Math.max(...lanes.map((l) => l.endMs ?? l.startMs))
        : null;

  return {
    key: group.key,
    label: group.label,
    color: group.color,
    lanes,
    startMs,
    endMs,
    open: openLanes.length,
    done: lanes.length - openLanes.length,
    overdue,
    attentionCount,
    attention,
    nextDue,
    nodes,
  };
}

/** One summary per group, in group order. */
export function buildStreams(groups: LaneGroup[], opts: StreamOpts): StreamSummary[] {
  return groups.map((g) => summarize(g, opts));
}

/** Most pressing first: attention desc, overdue count desc, nextDue asc (none last). Stable. */
export function rankStreams(streams: StreamSummary[]): StreamSummary[] {
  return [...streams].sort((a, b) => {
    if (a.attention.score !== b.attention.score) return b.attention.score - a.attention.score;
    if (a.overdue !== b.overdue) return b.overdue - a.overdue;
    if (a.nextDue === b.nextDue) return 0;
    if (a.nextDue === null) return 1;
    if (b.nextDue === null) return -1;
    return a.nextDue < b.nextDue ? -1 : 1;
  });
}
