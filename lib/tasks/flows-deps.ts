// Dependencies on the web Flows canvas (runway style): which bars a task's
// waits-for links join, and the elbow connectors drawn between them while a
// task is hovered or focused. Pure pixel geometry, so it is unit-tested apart
// from FlowTrack, which only paints what these return.
//
// An edge `{ taskId, dependsOnTaskId }` reads "taskId waits for dependsOnTaskId":
// the connector runs from the END of the blocker's bar to the START of the
// waiting bar, with its arrowhead at the waiting end. Links to tasks that are
// not on screen (another stream, a collapsed lane) draw nothing.

import { FLOW_GEOM, type FlowRow, type FlowSegment } from "@/lib/tasks/flows-layout";

export interface DepEdgeIn {
  taskId: string;
  dependsOnTaskId: string;
}

/** Where a task's bar sits on the canvas (px). */
export interface DepAnchor {
  /** the bar's start and end (the end excludes a late overrun) */
  x1: number;
  x2: number;
  /** its vertical centre and height, and its row's top and bottom (the gaps between rows are the line's road) */
  cy: number;
  h: number;
  rowTop: number;
  rowBottom: number;
}

export interface DepArrow {
  from: string;
  to: string;
  /** SVG path, px */
  d: string;
  /** the arrowhead's tip: the waiting bar's start */
  head: { x: number; y: number };
}

/** How far a connector runs out of a bar before it turns, px. */
export const DEP_ELBOW = 10;

/** A task's links: what it waits for, and what waits for it. */
export function depLinksOf(
  id: string,
  deps: readonly DepEdgeIn[],
): { blockers: string[]; holds: string[] } {
  const blockers: string[] = [];
  const holds: string[] = [];
  for (const d of deps) {
    if (d.taskId === id && !blockers.includes(d.dependsOnTaskId)) blockers.push(d.dependsOnTaskId);
    if (d.dependsOnTaskId === id && !holds.includes(d.taskId)) holds.push(d.taskId);
  }
  return { blockers, holds };
}

/**
 * Each visible bar's anchor, by task id: every lane row's trunk and its
 * expanded branches. A task shown in several groups keeps its first row, so a
 * connector has one end. `extentOf` gives a segment's bar span in px, or null
 * when it draws no bar (line style, a milestone).
 */
export function depAnchors(
  rows: readonly FlowRow[],
  extentOf: (seg: FlowSegment, barHeight: number) => { x1: number; x2: number } | null,
  geom: Pick<typeof FLOW_GEOM, "laneHeight" | "subRowHeight" | "runwayHeight" | "branchRunwayHeight"> = FLOW_GEOM,
): Map<string, DepAnchor> {
  const out = new Map<string, DepAnchor>();
  for (const row of rows) {
    if (row.kind !== "lane") continue;
    const trunk = extentOf(row.lane, geom.runwayHeight);
    if (trunk && !out.has(row.lane.task.id)) {
      out.set(row.lane.task.id, {
        ...trunk,
        cy: row.top + geom.laneHeight / 2,
        h: geom.runwayHeight,
        rowTop: row.top,
        rowBottom: row.top + geom.laneHeight,
      });
    }
    for (const { branch, subTop } of row.branchRows) {
      const ext = extentOf(branch, geom.branchRunwayHeight);
      if (!ext || out.has(branch.task.id)) continue;
      out.set(branch.task.id, {
        ...ext,
        cy: subTop + geom.subRowHeight / 2,
        h: geom.branchRunwayHeight,
        rowTop: subTop,
        rowBottom: subTop + geom.subRowHeight,
      });
    }
  }
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * An elbow connector from a blocker's bar to a waiting bar's start. It leaves
 * the blocker through its bottom (or top) edge just inside its end, so it never
 * crosses the deadline words beside the bar, drops to the waiting row and runs
 * in to its start. When the waiting bar starts left of that drop, the line runs
 * through the gap above (or below) the waiting row and comes in from its left,
 * never back across a bar.
 */
export function depElbow(
  from: { x1: number; x2: number; y: number; h: number },
  to: { x: number; y: number; rowTop: number; rowBottom: number },
  elbow = DEP_ELBOW,
): string {
  const down = to.y >= from.y;
  const sx = Math.max(from.x1 + 2, from.x2 - 6);
  const sy = down ? from.y + from.h / 2 : from.y - from.h / 2;
  if (to.x >= sx + elbow) return `M ${r1(sx)} ${r1(sy)} V ${r1(to.y)} H ${r1(to.x)}`;
  const gapY = down ? to.rowTop : to.rowBottom;
  const back = to.x - elbow;
  return `M ${r1(sx)} ${r1(sy)} V ${r1(gapY)} H ${r1(back)} V ${r1(to.y)} H ${r1(to.x)}`;
}

/** The connectors for the active task: each blocker on screen into it, and it into each task on screen that waits for it. */
export function depArrows(
  activeId: string | null,
  deps: readonly DepEdgeIn[],
  anchors: ReadonlyMap<string, DepAnchor>,
): DepArrow[] {
  if (!activeId || !anchors.has(activeId)) return [];
  const { blockers, holds } = depLinksOf(activeId, deps);
  const out: DepArrow[] = [];
  const add = (from: string, to: string) => {
    const a = anchors.get(from);
    const b = anchors.get(to);
    if (!a || !b || from === to) return;
    out.push({
      from,
      to,
      d: depElbow(
        { x1: a.x1, x2: a.x2, y: a.cy, h: a.h },
        { x: b.x1, y: b.cy, rowTop: b.rowTop, rowBottom: b.rowBottom },
      ),
      head: { x: b.x1, y: b.cy },
    });
  };
  for (const b of blockers) add(b, activeId);
  for (const h of holds) add(activeId, h);
  return out;
}

/** Bars to dim while `activeId` is active: every anchored bar but it and its links. Empty when nothing is active. */
export function depDimmed(
  activeId: string | null,
  deps: readonly DepEdgeIn[],
  anchors: ReadonlyMap<string, DepAnchor>,
): Set<string> {
  if (!activeId || !anchors.has(activeId)) return new Set();
  const { blockers, holds } = depLinksOf(activeId, deps);
  const keep = new Set([activeId, ...blockers, ...holds]);
  return new Set([...anchors.keys()].filter((id) => !keep.has(id)));
}
