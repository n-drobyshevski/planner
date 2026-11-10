import { describe, expect, it } from "vitest";

import type { FlowStreamOut, FlowSubtaskOut, FlowTaskOut } from "@/lib/mcp/flows";
import {
  LANE_GAP,
  LANE_PAD,
  STRINGS,
  SUB_ROW,
  TASK_ROW,
  blockedByPatch,
  dependencyArrows,
  dependencyEdges,
  dimmedRows,
  elbowPath,
  flowItems,
  hasChildren,
  laneRows,
  linksOf,
  offscreenBlockers,
  runwayOf,
  subtaskRunway,
  subtaskWaitTitle,
  subtreeProgress,
  waitCandidates,
  type LaneRow,
} from "@/lib/mcp/app/view-model";

const TODAY = "2026-11-10";
const task = (p: Partial<FlowTaskOut> & { id: string }): FlowTaskOut => ({ title: p.id, score: 0.5, overdue: false, ...p });
const sub = (p: Partial<FlowSubtaskOut> & { id: string }): FlowSubtaskOut => ({
  title: p.id,
  parentId: "p",
  depth: 1,
  done: false,
  ...p,
});
const stream = (label: string, tasks: FlowTaskOut[]): FlowStreamOut => ({
  key: `tag:${label}`,
  label,
  open: tasks.length,
  done: 0,
  overdue: 0,
  needsAttention: 0,
  score: 0.5,
  tasks,
});

const parent = task({
  id: "p",
  start: "2026-11-02",
  dueDate: "2026-11-14",
  subtasks: [
    sub({ id: "a", done: true, start: "2026-11-02", due: "2026-11-05" }),
    sub({ id: "b" }),
    sub({ id: "b1", parentId: "b", depth: 2 }),
    sub({ id: "b1x", parentId: "b1", depth: 3 }),
    sub({ id: "b1y", parentId: "b1x", depth: 4 }),
    sub({ id: "c", blocked: true }),
  ],
});

describe("subtaskRunway", () => {
  it("uses the subtask's own dates", () => {
    const r = subtaskRunway(sub({ id: "x", start: "2026-11-08", due: "2026-11-12" }), parent, TODAY);
    const own = runwayOf({ id: "x", title: "x", start: "2026-11-08", dueDate: "2026-11-12", score: 0, overdue: false }, TODAY);
    expect(r).toEqual(own);
  });
  it("falls back to the parent's span when it has no dates", () => {
    const r = subtaskRunway(sub({ id: "x" }), parent, TODAY);
    expect([r.x0, r.x1]).toEqual([runwayOf(parent, TODAY).x0, runwayOf(parent, TODAY).x1]);
  });
  it("takes the missing end from the parent when it fits", () => {
    const r = subtaskRunway(sub({ id: "x", start: "2026-11-09" }), parent, TODAY);
    expect(r.x1).toBe(runwayOf(parent, TODAY).x1);
  });
  it("never shows a done subtask as late", () => {
    const r = subtaskRunway(sub({ id: "x", done: true, start: "2026-11-01", due: "2026-11-03" }), parent, TODAY);
    expect(r.state).toBe("open");
    expect(r.over).toBeNull();
  });
});

describe("laneRows", () => {
  const other = task({ id: "q" });
  it("shows only tasks while collapsed", () => {
    const rows = laneRows([parent, other], new Set());
    expect(rows.map((r) => r.id)).toEqual(["p", "q"]);
    expect(rows.map((r) => r.top)).toEqual([LANE_PAD, LANE_PAD + TASK_ROW + LANE_GAP]);
  });
  it("shows direct subtasks of an expanded task, thinner, in place", () => {
    const rows = laneRows([parent, other], new Set(["p"]));
    expect(rows.map((r) => r.id)).toEqual(["p", "a", "b", "c", "q"]);
    expect(rows[1].height).toBe(SUB_ROW);
    expect(rows[4].top).toBe(LANE_PAD + TASK_ROW + 3 * SUB_ROW + 4 * LANE_GAP);
  });
  it("opens deeper levels only under expanded subtasks, never past depth 3", () => {
    const rows = laneRows([parent], new Set(["p", "b", "b1", "b1x"]));
    expect(rows.map((r) => r.id)).toEqual(["p", "a", "b", "b1", "b1x", "c"]);
  });
  it("knows which rows can expand", () => {
    const rows = laneRows([parent, other], new Set(["p", "b", "b1"]));
    const can = (id: string) => hasChildren(rows.find((r) => r.id === id) as LaneRow);
    expect([can("p"), can("a"), can("b"), can("b1"), can("b1x"), can("q")]).toEqual([true, false, true, true, false, false]);
  });
  it("counts a subtask's own subtree", () => {
    expect(subtreeProgress(parent.subtasks ?? [], "b")).toEqual({ done: 0, total: 3 });
    expect(subtreeProgress(parent.subtasks ?? [], "a")).toBeNull();
  });
});

describe("subtaskWaitTitle", () => {
  const subs = [
    sub({ id: "s1", title: "Spec", done: true }),
    sub({ id: "s2", title: "Write the connector" }),
    sub({ id: "s3", title: "Auth flow", blocked: true }),
    sub({ id: "s4", title: "Ship", blocked: true, waitingOn: [{ id: "z", title: "Legal review" }] }),
  ];
  it("names the open sibling before it under a do-in-order parent", () => {
    expect(subtaskWaitTitle(subs[2], subs)).toBe("Write the connector");
  });
  it("prefers its named blocker", () => {
    expect(subtaskWaitTitle(subs[3], subs)).toBe("Legal review");
  });
  it("is null when not blocked", () => {
    expect(subtaskWaitTitle(subs[1], subs)).toBeNull();
  });
});

// w1 ← w2 ← w3, and w3 also waits for x (another stream) and for subtask p/c.
const w1 = task({ id: "w1", start: "2026-11-01", dueDate: "2026-11-08" });
const w2 = task({ id: "w2", start: "2026-11-09", dueDate: "2026-11-15", blocked: true, waitingOn: [{ id: "w1", title: "w1" }] });
const w3 = task({
  id: "w3",
  start: "2026-11-03",
  dueDate: "2026-11-20",
  blocked: true,
  waitingOn: [
    { id: "w2", title: "w2" },
    { id: "x", title: "Renew the contract" },
  ],
});
const lone = task({ id: "w4" });
const streams = [stream("work", [w1, w2, w3, lone, parent]), stream("admin", [task({ id: "x" }), w1])];

describe("flowItems and dependency edges", () => {
  const items = flowItems(streams);
  it("lists every task and subtask once", () => {
    expect(items.map((i) => i.id)).toEqual(["w1", "w2", "w3", "w4", "p", "a", "b", "b1", "b1x", "b1y", "c", "x"]);
    expect(items.find((i) => i.id === "b")?.under).toBe("p");
  });
  it("inverts waitingOn into holds", () => {
    const edges = dependencyEdges(items);
    expect(linksOf("w2", edges)).toEqual({ blockers: ["w1"], holds: ["w3"] });
    expect(linksOf("w1", edges)).toEqual({ blockers: [], holds: ["w2"] });
  });
});

describe("selection: dimming and arrows", () => {
  const items = flowItems(streams);
  const edges = dependencyEdges(items);
  const rows = laneRows([w1, w2, w3, lone], new Set());
  const runway = (r: LaneRow) => runwayOf(r.kind === "task" ? r.task : r.task, TODAY);

  it("dims nothing without a selection", () => {
    expect(dimmedRows(rows, null, edges).size).toBe(0);
  });
  it("keeps the selected task and its links full, dims the rest", () => {
    expect([...dimmedRows(rows, "w2", edges)]).toEqual(["w4"]);
    expect([...dimmedRows(rows, "w4", edges)]).toEqual(["w1", "w2", "w3"]);
  });
  it("draws blocker → selected and selected → holds, ending at the waiting bar's start", () => {
    const arrows = dependencyArrows(rows, "w2", edges, runway);
    expect(arrows.map((a) => [a.from, a.to])).toEqual([
      ["w1", "w2"],
      ["w2", "w3"],
    ]);
    const rb = runwayOf(w2, TODAY);
    expect(arrows[0].head).toEqual({ x: rb.x0 * 100, y: rows[1].top + TASK_ROW / 2 });
    expect(arrows[0].d.startsWith(`M${Math.round(runwayOf(w1, TODAY).x1 * 10000) / 100} `)).toBe(true);
  });
  it("draws nothing for a selection that is not on screen", () => {
    expect(dependencyArrows(rows, "x", edges, runway)).toEqual([]);
  });
  it("names the selected task's off-screen blockers instead", () => {
    expect(offscreenBlockers(rows, "w3", items)).toEqual([{ id: "x", title: "Renew the contract" }]);
    expect(offscreenBlockers(rows, "w2", items)).toEqual([]);
  });
});

describe("elbowPath", () => {
  it("turns once when the waiting bar starts to the right", () => {
    expect(elbowPath({ x1: 0.3, y: 24 }, { x0: 0.5, y: 60, top: 44, bottom: 76 })).toBe("M30 24H31.5V60H50");
  });
  it("goes round through the gap when the waiting bar starts to the left", () => {
    expect(elbowPath({ x1: 0.5, y: 24 }, { x0: 0.2, y: 60, top: 44, bottom: 76 })).toBe(
      `M50 24H51.5V${44 - LANE_GAP / 2}H18.5V60H20`,
    );
  });
  it("comes up from below for a waiting row above", () => {
    expect(elbowPath({ x1: 0.5, y: 60 }, { x0: 0.2, y: 24, top: 8, bottom: 40 })).toBe(
      `M50 60H51.5V${40 + LANE_GAP / 2}H18.5V24H20`,
    );
  });
});

describe("waitCandidates", () => {
  const items = flowItems(streams);
  it("excludes itself and done subtasks, puts tasks before subtasks", () => {
    const ids = waitCandidates("w2", items, ["w1"], [], "", 50).map((c) => c.id);
    expect(ids).not.toContain("w2");
    expect(ids).not.toContain("a");
    expect(ids.slice(0, 5)).toEqual(["w1", "w3", "w4", "p", "x"]);
  });
  it("disables what is already added and what would make a loop", () => {
    const found = waitCandidates("w1", items, [], [], "w", 50);
    const by = Object.fromEntries(found.map((c) => [c.id, c.disabled]));
    // w2 and (through w2) w3 already wait for w1.
    expect(by).toMatchObject({ w2: "loop", w3: "loop", w4: null });
    expect(waitCandidates("w2", items, ["w1"], [], "w1")[0].disabled).toBe("added");
  });
  it("uses get_task's full list of waiters too", () => {
    const found = waitCandidates("x", items, [], ["w4"], "w4");
    expect(found[0]).toMatchObject({ id: "w4", disabled: "loop" });
  });
  it("matches the query case-insensitively and names the context", () => {
    const found = waitCandidates(null, items, [], [], "B1X");
    expect(found).toEqual([{ id: "b1x", title: "b1x", context: "work › p", disabled: null }]);
  });
});

describe("blockedByPatch", () => {
  it("is undefined when the set is unchanged, in any order", () => {
    expect(blockedByPatch(["a", "b"], ["b", "a"])).toBeUndefined();
  });
  it("is the new set when it changed, [] when cleared", () => {
    expect(blockedByPatch(["a"], ["a", "c"])).toEqual(["a", "c"]);
    expect(blockedByPatch(["a"], [])).toEqual([]);
  });
});

describe("dependency strings", () => {
  it("has every new string in both languages", () => {
    for (const key of ["waitsFor", "holds", "holdsNone", "alreadyAdded", "wouldLoop", "findTask"] as const) {
      expect(STRINGS.en[key]).toBeTruthy();
      expect(STRINGS.ru[key]).toBeTruthy();
    }
    expect(STRINGS.ru.waits("A")).toBe("ждёт: A");
    expect(STRINGS.en.after("A")).toBe("after A");
  });
});
