import { describe, it, expect } from "vitest";
import { buildStreams, rankStreams } from "@/lib/tasks/flows-streams";
import type { FlowLane, LaneGroup } from "@/lib/tasks/flows-layout";
import type { TaskRow } from "@/lib/types";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 5, 1);
const opts = { nowMs: Date.UTC(2026, 5, 10), today: "2026-06-10", mode: "deadline" as const };

function task(over: Partial<TaskRow>): TaskRow {
  return {
    id: "t",
    workspaceId: "w",
    ownerId: "me",
    assigneeId: null,
    parentId: null,
    collectionId: null,
    categoryId: null,
    title: "t",
    description: null,
    isPrivate: false,
    color: null,
    boardId: null,
    priority: null,
    dueDate: null,
    startDate: null,
    isMilestone: false,
    position: 0,
    sequential: false,
    completedAt: null,
    attributes: {},
    tags: [],
    createdAt: T0,
    updatedAt: T0,
    updatedBy: null,
    ...over,
  };
}

function lane(over: Partial<TaskRow> & { startMs?: number }): FlowLane {
  const { startMs, ...rest } = over;
  const t = task(rest);
  const done = t.completedAt != null;
  const nodes: FlowLane["nodes"] = [{ ms: T0, kind: "created" }];
  if (t.dueDate) {
    const ms = Date.parse(t.dueDate + "T00:00:00Z");
    nodes.push({ ms, kind: "due", overdue: !done && ms < opts.nowMs });
  }
  if (done) nodes.push({ ms: t.completedAt!, kind: "done" });
  return {
    task: t,
    startMs: startMs ?? T0,
    endMs: done ? t.completedAt : null,
    nodes: nodes.sort((a, b) => a.ms - b.ms),
    milestone: false,
    checkpoints: [],
    branches: [],
    done,
  };
}

const group = (key: string, lanes: FlowLane[]): LaneGroup => ({ key, label: key, lanes, header: true });

describe("buildStreams", () => {
  it("summarizes counts, nextDue, attention and nodes", () => {
    const g = group("g", [
      lane({ id: "late", dueDate: "2026-06-08", startMs: T0 + DAY }),
      lane({ id: "soon", dueDate: "2026-06-12" }),
      lane({ id: "far", dueDate: "2026-08-01" }),
      lane({ id: "fin", dueDate: "2026-06-03", completedAt: T0 + 5 * DAY }),
    ]);
    const [s] = buildStreams([g], opts);
    expect(s.open).toBe(3);
    expect(s.done).toBe(1);
    expect(s.overdue).toBe(1);
    expect(s.attentionCount).toBe(2); // late (1) and soon (~0.86)
    expect(s.nextDue).toBe("2026-06-08");
    expect(s.attention.score).toBe(1);
    expect(s.attention.overdue).toBe(true);
    expect(s.startMs).toBe(T0);
    expect(s.endMs).toBeNull();
    // open lanes' due markers + the finished lane's done node, sorted
    expect(s.nodes.filter((n) => n.kind === "done")).toHaveLength(1);
    expect(s.nodes.filter((n) => n.kind === "due")).toHaveLength(3);
    expect(s.nodes.map((n) => n.ms)).toEqual([...s.nodes.map((n) => n.ms)].sort((a, b) => a - b));
  });

  it("endMs is the latest end once every lane is done", () => {
    const g = group("g", [
      lane({ id: "a", completedAt: T0 + 3 * DAY }),
      lane({ id: "b", completedAt: T0 + 6 * DAY }),
    ]);
    const [s] = buildStreams([g], opts);
    expect(s.endMs).toBe(T0 + 6 * DAY);
    expect(s.open).toBe(0);
    expect(s.nextDue).toBeNull();
    expect(s.attention.score).toBe(0);
  });

  it("keeps group order and carries label/color", () => {
    const out = buildStreams([{ ...group("x", [lane({ id: "a" })]), color: "#fff" }, group("y", [lane({ id: "b" })])], opts);
    expect(out.map((s) => s.key)).toEqual(["x", "y"]);
    expect(out[0].color).toBe("#fff");
  });
});

describe("rankStreams", () => {
  it("orders by attention, then overdue, then nextDue (nulls last), stably", () => {
    const mk = (key: string, lanes: FlowLane[]) => buildStreams([group(key, lanes)], opts)[0];
    const hotOverdue = mk("hot", [lane({ id: "1", dueDate: "2026-06-01" })]);
    const hotToday = mk("today", [lane({ id: "2", dueDate: "2026-06-10" })]);
    const mid = mk("mid", [lane({ id: "3", dueDate: "2026-06-17" })]);
    const calmA = mk("calmA", [lane({ id: "4" })]);
    const calmB = mk("calmB", [lane({ id: "5" })]);
    const calmDue = mk("calmDue", [lane({ id: "6", dueDate: "2026-12-01" })]);
    const ranked = rankStreams([calmA, mid, hotToday, calmDue, hotOverdue, calmB]);
    expect(ranked.map((s) => s.key)).toEqual(["hot", "today", "mid", "calmDue", "calmA", "calmB"]);
  });
});
