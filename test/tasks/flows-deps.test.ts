import { describe, expect, it } from "vitest";

import { FLOW_GEOM, type FlowRow, type FlowSegment } from "@/lib/tasks/flows-layout";
import {
  DEP_ELBOW,
  depAnchors,
  depArrows,
  depDimmed,
  depElbow,
  depLinksOf,
  type DepAnchor,
} from "@/lib/tasks/flows-deps";
import type { TaskRow } from "@/lib/types";

const G = FLOW_GEOM;
const seg = (id: string, startMs: number, endMs: number): FlowSegment => ({
  task: { id, title: id } as TaskRow,
  startMs,
  endMs,
  nodes: [],
  milestone: false,
  checkpoints: [],
});

// a ← b (b waits for a), b ← c, and c waits for x (not on screen).
const deps = [
  { taskId: "b", dependsOnTaskId: "a" },
  { taskId: "c", dependsOnTaskId: "b" },
  { taskId: "c", dependsOnTaskId: "x" },
];

describe("depLinksOf", () => {
  it("splits a task's links into what it waits for and what waits for it", () => {
    expect(depLinksOf("b", deps)).toEqual({ blockers: ["a"], holds: ["c"] });
    expect(depLinksOf("c", deps)).toEqual({ blockers: ["b", "x"], holds: [] });
  });
});

describe("depAnchors", () => {
  // x = ms (1px per ms), so a segment's span is its pixel span.
  const lane = (id: string, top: number, startMs: number, endMs: number, branches: [FlowSegment, number][] = []) =>
    ({
      kind: "lane",
      rowKey: `g:${id}`,
      lane: { ...seg(id, startMs, endMs), branches: [], done: false },
      top,
      isExpanded: branches.length > 0,
      branchRows: branches.map(([b, subTop]) => ({ branch: { ...b, depth: 1, parentId: id }, subTop })),
      height: G.laneHeight + branches.length * G.subRowHeight,
    }) as FlowRow;
  const extent = (s: FlowSegment) => ({ x1: s.startMs, x2: s.endMs ?? 0 });

  it("anchors trunks and expanded branches at their row centres", () => {
    const rows: FlowRow[] = [
      { kind: "group", key: "g", label: "g", top: 0, height: 28, count: 2 },
      lane("a", 28, 10, 100, [[seg("a1", 20, 60), 28 + G.laneHeight]]),
      lane("b", 28 + G.laneHeight + G.subRowHeight, 120, 200),
    ];
    const anchors = depAnchors(rows, extent);
    expect(anchors.get("a")).toEqual({
      x1: 10,
      x2: 100,
      cy: 28 + G.laneHeight / 2,
      h: G.runwayHeight,
      rowTop: 28,
      rowBottom: 28 + G.laneHeight,
    });
    expect(anchors.get("a1")?.cy).toBe(28 + G.laneHeight + G.subRowHeight / 2);
    expect([...anchors.keys()]).toEqual(["a", "a1", "b"]);
  });
  it("keeps a task's first row when it shows in several groups, and skips bar-less segments", () => {
    const rows = [lane("a", 0, 10, 100), lane("a", 200, 10, 100), lane("m", 300, 5, 5)];
    const anchors = depAnchors(rows, (s) => (s.task.id === "m" ? null : extent(s)));
    expect(anchors.get("a")?.rowTop).toBe(0);
    expect(anchors.has("m")).toBe(false);
  });
});

const anchor = (x1: number, x2: number, rowTop: number): DepAnchor => ({
  x1,
  x2,
  cy: rowTop + 22,
  h: 26,
  rowTop,
  rowBottom: rowTop + 44,
});

describe("depElbow", () => {
  const from = { x1: 20, x2: 100, y: 22, h: 26 };
  it("drops from just inside the blocker's end and runs in when the waiting bar starts to the right", () => {
    expect(depElbow(from, { x: 160, y: 66, rowTop: 44, rowBottom: 88 })).toBe("M 94 35 V 66 H 160");
  });
  it("goes round through the row gap when the waiting bar starts to the left", () => {
    expect(depElbow(from, { x: 60, y: 66, rowTop: 44, rowBottom: 88 })).toBe(
      `M 94 35 V 44 H ${60 - DEP_ELBOW} V 66 H 60`,
    );
  });
  it("leaves through the top edge for a waiting row above", () => {
    expect(depElbow({ ...from, y: 66 }, { x: 60, y: 22, rowTop: 0, rowBottom: 44 })).toBe(
      `M 94 53 V 44 H ${60 - DEP_ELBOW} V 22 H 60`,
    );
  });
  it("stays inside a bar narrower than the inset", () => {
    expect(depElbow({ x1: 98, x2: 102, y: 22, h: 26 }, { x: 160, y: 66, rowTop: 44, rowBottom: 88 })).toBe(
      "M 100 35 V 66 H 160",
    );
  });
});

describe("depArrows and depDimmed", () => {
  const anchors = new Map([
    ["a", anchor(0, 100, 0)],
    ["b", anchor(140, 220, 44)],
    ["c", anchor(260, 300, 88)],
    ["d", anchor(0, 50, 132)],
  ]);
  it("draws nothing without an active task, or for one not on screen", () => {
    expect(depArrows(null, deps, anchors)).toEqual([]);
    expect(depArrows("x", deps, anchors)).toEqual([]);
  });
  it("joins blocker end → active start and active end → waiting start, head at the waiting bar", () => {
    const arrows = depArrows("b", deps, anchors);
    expect(arrows.map((a) => [a.from, a.to])).toEqual([
      ["a", "b"],
      ["b", "c"],
    ]);
    expect(arrows[0].d.startsWith("M 94 35")).toBe(true);
    expect(arrows[0].head).toEqual({ x: 140, y: 66 });
    expect(arrows[1].head).toEqual({ x: 260, y: 110 });
  });
  it("leaves off-screen blockers out", () => {
    expect(depArrows("c", deps, anchors).map((a) => a.from)).toEqual(["b"]);
  });
  it("dims every bar but the active one and its links", () => {
    expect([...depDimmed("b", deps, anchors)]).toEqual(["d"]);
    expect(depDimmed(null, deps, anchors).size).toBe(0);
  });
});
