import { describe, it, expect } from "vitest";
import {
  projectFlows,
  projectTaskDetail,
  resolveFlowOptions,
  MAX_STREAMS,
  MAX_FLOW_SUBTASKS,
  type FlowsInput,
  type FlowSubtaskOut,
} from "@/lib/mcp/flows";
import { DEFAULT_FLOWS_DISPLAY, DEFAULT_FLOWS_FILTER } from "@/lib/tasks/flows-display";
import type { TaskDependency, TaskRow } from "@/lib/types";

const ME = "m-me";
const PARTNER = "m-partner";
const TODAY = "2026-07-10";
const NOW = Date.UTC(2026, 6, 10, 9);

let seq = 0;
function task(p: Partial<TaskRow> & { title: string }): TaskRow {
  seq++;
  return {
    id: `t${seq}`,
    workspaceId: "w1",
    ownerId: ME,
    assigneeId: null,
    parentId: null,
    collectionId: null,
    categoryId: null,
    description: "SECRET DESCRIPTION",
    isPrivate: false,
    color: null,
    boardId: null,
    priority: null,
    dueDate: null,
    startDate: null,
    isMilestone: false,
    position: seq,
    sequential: false,
    completedAt: null,
    attributes: {},
    tags: [],
    createdAt: 1000 + seq,
    updatedAt: 1000 + seq,
    updatedBy: null,
    ...p,
  };
}

/** `taskId` waits for `dependsOnTaskId`. */
function dep(taskId: string, dependsOnTaskId: string): TaskDependency {
  return { id: `d-${taskId}-${dependsOnTaskId}`, workspaceId: "w1", taskId, dependsOnTaskId, createdAt: 1 };
}

function input(tasks: TaskRow[], over: Partial<FlowsInput> = {}): FlowsInput {
  return {
    tasks,
    boards: [],
    categories: [],
    collections: [],
    members: [
      { id: ME, name: "Me", color: "#111" },
      { id: PARTNER, name: "Partner", color: "#222" },
    ] as never,
    memberId: ME,
    date: TODAY,
    nowMs: NOW,
    groupBy: "tag",
    attention: "combined",
    mine: false,
    limit: 3,
    dependencies: [],
    ...over,
  };
}

describe("projectFlows", () => {
  it("returns no streams for an empty workspace", () => {
    const out = projectFlows(input([]));
    expect(out).toEqual({ date: TODAY, groupBy: "tag", attention: "combined", streams: [] });
  });

  it("puts a two-tag task in both tag streams and untagged work in 'No tag'", () => {
    const out = projectFlows(
      input([
        task({ title: "Both", tags: ["thesis", "home"] }),
        task({ title: "Thesis only", tags: ["thesis"] }),
        task({ title: "Loose" }),
      ]),
    );
    const byLabel = Object.fromEntries(out.streams.map((s) => [s.label, s]));
    expect(Object.keys(byLabel).sort()).toEqual(["No tag", "home", "thesis"]);
    expect(byLabel.thesis.open).toBe(2);
    expect(byLabel.home.open).toBe(1);
    expect(byLabel.home.tasks[0].title).toBe("Both");
    expect(byLabel.thesis.tasks.map((t) => t.title)).toContain("Both");
    expect(byLabel["No tag"].tasks[0].title).toBe("Loose");
  });

  it("orders streams most-attention-first and tasks by score then deadline", () => {
    const out = projectFlows(
      input([
        task({ title: "Calm", tags: ["calm"], priority: 1, dueDate: "2026-08-30" }),
        task({ title: "Hot", tags: ["hot"], priority: 3, dueDate: "2026-07-09" }),
        task({ title: "B soon", tags: ["mix"], priority: 3, dueDate: "2026-07-12" }),
        task({ title: "A sooner", tags: ["mix"], priority: 3, dueDate: "2026-07-11" }),
        task({ title: "C low", tags: ["mix"], priority: 0 }),
      ]),
    );
    expect(out.streams.map((s) => s.label)).toEqual(["hot", "mix", "calm"]);
    // hot: urgency 1 + importance 1 -> 1
    expect(out.streams[0].score).toBe(1);
    expect(out.streams[0].tasks[0]).toMatchObject({ title: "Hot", score: 1, overdue: true });
    // mix: both 3-priority tasks; the nearer deadline has the higher score
    expect(out.streams[1].tasks.map((t) => t.title)).toEqual(["A sooner", "B soon", "C low"]);
  });

  it("breaks score ties by the sooner deadline, undated last", () => {
    const out = projectFlows(
      input(
        [
          task({ title: "Undated", tags: ["x"], priority: 3 }),
          task({ title: "Dated", tags: ["x"], priority: 3, dueDate: "2026-12-31" }),
        ],
        { attention: "priority" },
      ),
    );
    expect(out.streams[0].tasks.map((t) => t.title)).toEqual(["Dated", "Undated"]);
  });

  it("limits tasks per stream and rounds scores to 2 decimals", () => {
    const tasks = [1, 2, 3, 4, 5].map((i) =>
      task({ title: `T${i}`, tags: ["x"], priority: 1, dueDate: `2026-07-${10 + i}` }),
    );
    const out = projectFlows(input(tasks, { limit: 2 }));
    expect(out.streams[0].open).toBe(5);
    expect(out.streams[0].tasks).toHaveLength(2);
    // T1: urgency 1 - 1/14, importance 1/3 -> mean 0.6269...
    expect(out.streams[0].tasks[0].score).toBe(0.63);
  });

  it("excludes done tasks from `tasks` but counts them in `done`", () => {
    const out = projectFlows(
      input([
        task({ title: "Open", tags: ["x"], priority: 2 }),
        task({ title: "Finished", tags: ["x"], priority: 3, completedAt: 5 }),
      ]),
    );
    const s = out.streams[0];
    expect(s.open).toBe(1);
    expect(s.done).toBe(1);
    expect(s.tasks.map((t) => t.title)).toEqual(["Open"]);
  });

  it("lists a stream with only done tasks, with empty tasks", () => {
    const out = projectFlows(input([task({ title: "Fin", tags: ["x"], completedAt: 5 })]));
    expect(out.streams[0]).toMatchObject({ open: 0, done: 1, tasks: [], score: 0 });
    expect(out.streams[0]).not.toHaveProperty("nextDue");
  });

  it("reports overdue and nextDue, due today not overdue", () => {
    const out = projectFlows(
      input([
        task({ title: "Late", tags: ["x"], dueDate: "2026-07-01" }),
        task({ title: "Today", tags: ["x"], dueDate: TODAY }),
        task({ title: "Later", tags: ["x"], dueDate: "2026-07-30" }),
      ]),
    );
    const s = out.streams[0];
    expect(s.overdue).toBe(1);
    expect(s.nextDue).toBe("2026-07-01");
    const today = s.tasks.find((t) => t.title === "Today")!;
    expect(today.overdue).toBe(false);
    expect(today.score).toBe(0.5);
    expect(s.needsAttention).toBe(2);
  });

  it("lets an urgent subtask raise its parent's score", () => {
    const parent = task({ title: "Parent", tags: ["x"], priority: 0 });
    const child = task({ title: "Child", parentId: parent.id, priority: 3, dueDate: "2026-07-01" });
    const out = projectFlows(input([parent, child]));
    expect(out.streams[0].open).toBe(1); // only the top-level task is a lane
    expect(out.streams[0].tasks).toHaveLength(1);
    expect(out.streams[0].tasks[0]).toMatchObject({ id: parent.id, score: 1, overdue: true });
  });

  it("`mine` keeps top-level tasks the caller owns or is assigned to", () => {
    const tasks = [
      task({ title: "Mine", tags: ["x"] }),
      task({ title: "Assigned", tags: ["x"], ownerId: PARTNER, assigneeId: ME }),
      task({ title: "Theirs", tags: ["x"], ownerId: PARTNER }),
    ];
    const all = projectFlows(input(tasks));
    expect(all.streams[0].open).toBe(3);
    const mine = projectFlows(input(tasks, { mine: true }));
    expect(mine.streams[0].tasks.map((t) => t.title).sort()).toEqual(["Assigned", "Mine"]);
  });

  it("omits empty optionals and never carries a description", () => {
    const out = projectFlows(
      input([
        task({ title: "Bare" }),
        task({ title: "Full", tags: ["t"], priority: 2, dueDate: "2026-07-20" }),
      ]),
    );
    const bare = out.streams.find((s) => s.label === "No tag")!.tasks[0];
    expect(Object.keys(bare).sort()).toEqual(["id", "overdue", "score", "start", "title"]);
    expect(bare.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const full = out.streams.find((s) => s.label === "t")!.tasks[0];
    expect(full.tags).toEqual(["t"]);
    expect(JSON.stringify(out)).not.toContain("SECRET");
    expect(JSON.stringify(out)).not.toContain("null");
  });

  it("clips long titles", () => {
    const out = projectFlows(input([task({ title: "x".repeat(300) })]));
    expect(out.streams[0].tasks[0].title).toHaveLength(120);
  });

  it("groups by priority with plain-English labels", () => {
    const out = projectFlows(
      input([task({ title: "a", priority: 3 }), task({ title: "b" })], { groupBy: "priority" }),
    );
    expect(out.streams.map((s) => s.label).sort()).toEqual(["High", "No priority"]);
  });

  it("groups by assignee, with an Unassigned bucket", () => {
    const out = projectFlows(
      input([task({ title: "a", assigneeId: PARTNER }), task({ title: "b" })], {
        groupBy: "assignee",
      }),
    );
    expect(out.streams.map((s) => s.label).sort()).toEqual(["Partner", "Unassigned"]);
  });

  it("keeps the 30 top-ranked streams and flags truncation", () => {
    const tasks = Array.from({ length: 35 }, (_, i) =>
      task({ title: `T${i}`, tags: [`tag${String(i).padStart(2, "0")}`], priority: i % 4 }),
    );
    const out = projectFlows(input(tasks));
    expect(out.streams).toHaveLength(MAX_STREAMS);
    expect(out.truncated).toBe(true);
    const scores = out.streams.map((s) => s.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(projectFlows(input(tasks.slice(0, 30))).truncated).toBeUndefined();
  });

  it("applies a saved stream's filter and echoes its name; explicit args override", () => {
    const tasks = [
      task({ title: "Hi", tags: ["x"], priority: 3 }),
      task({ title: "Lo", tags: ["x"], priority: 1 }),
    ];
    const saved = {
      ...DEFAULT_FLOWS_DISPLAY,
      groupBy: "priority" as const,
      attention: "priority" as const,
      filter: { ...DEFAULT_FLOWS_FILTER, priorities: [3] },
    };
    const opts = resolveFlowOptions({}, saved);
    expect(opts).toMatchObject({ groupBy: "priority", attention: "priority" });
    const out = projectFlows(input(tasks, { ...opts, streamName: "Important" }));
    expect(out.stream).toBe("Important");
    expect(out.attention).toBe("priority");
    expect(out.streams.map((s) => s.label)).toEqual(["High"]);

    const over = resolveFlowOptions({ groupBy: "tag", attention: "deadline" }, saved);
    expect(over).toMatchObject({ groupBy: "tag", attention: "deadline" });
    expect(over.filter.priorities).toEqual([3]); // the filter still applies
  });

  it("falls back to the defaults without a stream, and to 'tag' for a saved 'none'", () => {
    expect(resolveFlowOptions({})).toEqual({
      groupBy: "tag",
      attention: "combined",
      filter: DEFAULT_FLOWS_FILTER,
    });
    expect(resolveFlowOptions({}, DEFAULT_FLOWS_DISPLAY).groupBy).toBe("tag");
  });
  it("gives each task its runway: the planned start, and subtask progress over the whole subtree", () => {
    const parent = task({ id: "p", title: "Parent", tags: ["t"], startDate: "2026-07-01", dueDate: "2026-07-20" });
    const out = projectFlows(
      input([
        parent,
        task({ id: "c1", title: "Child", parentId: "p", completedAt: NOW - 1 }),
        task({ id: "c2", title: "Child", parentId: "p" }),
        task({ id: "g1", title: "Grandchild", parentId: "c2", completedAt: NOW - 1 }),
        task({ id: "solo", title: "Solo", tags: ["t"] }),
      ]),
    );
    const tasks = out.streams.find((s) => s.label === "t")!.tasks;
    const p = tasks.find((t) => t.id === "p")!;
    expect(p.start).toBe("2026-07-01");
    expect(p.progress).toEqual({ done: 2, total: 3 });
    expect(tasks.find((t) => t.id === "solo")!.progress).toBeUndefined();
  });
});

describe("projectFlows — dependencies", () => {
  it("marks a task waiting on open blockers, most pressing first, at most three, and counts what it holds", () => {
    const tasks = [
      task({ id: "w", title: "Waiting", tags: ["x"] }),
      task({ id: "b-late", title: "Late", tags: ["y"], dueDate: "2026-07-30" }),
      task({ id: "b-soon", title: "Soon", tags: ["y"], dueDate: "2026-07-12" }),
      task({ id: "b-undated", title: "Undated", tags: ["y"] }),
      task({ id: "b-mid", title: "Mid", tags: ["y"], dueDate: "2026-07-20" }),
      task({ id: "b-done", title: "Finished", tags: ["y"], completedAt: NOW - 1 }),
      task({ id: "w2", title: "Also waiting", tags: ["y"] }),
      task({ id: "w-done", title: "Done waiter", tags: ["y"], completedAt: NOW - 1 }),
    ];
    const dependencies = [
      dep("w", "b-late"),
      dep("w", "b-soon"),
      dep("w", "b-undated"),
      dep("w", "b-mid"),
      dep("w", "b-done"),
      dep("w2", "b-soon"),
      dep("w-done", "b-soon"),
    ];
    const out = projectFlows(input(tasks, { dependencies, limit: 10 }));
    const all = out.streams.flatMap((s) => s.tasks);
    const w = all.find((t) => t.id === "w")!;
    expect(w.blocked).toBe(true);
    expect(w.waitingOn).toEqual([
      { id: "b-soon", title: "Soon" },
      { id: "b-mid", title: "Mid" },
      { id: "b-late", title: "Late" },
    ]);
    expect(w).not.toHaveProperty("holds");
    // Two open tasks wait for "Soon"; the done waiter doesn't count.
    expect(all.find((t) => t.id === "b-soon")!.holds).toBe(2);
    expect(all.find((t) => t.id === "b-late")!.holds).toBe(1);
    const free = all.find((t) => t.id === "b-mid")!;
    expect(free).not.toHaveProperty("blocked");
    expect(free).not.toHaveProperty("waitingOn");
    // never in get_flows' default output
    expect(all.some((t) => "subtasks" in t)).toBe(false);
  });

  it("is not blocked once every blocker is done", () => {
    const tasks = [
      task({ id: "w", title: "Waiting", tags: ["x"] }),
      task({ id: "b", title: "Blocker", tags: ["x"], completedAt: NOW - 1 }),
    ];
    const out = projectFlows(input(tasks, { dependencies: [dep("w", "b")] }));
    const w = out.streams[0].tasks.find((t) => t.id === "w")!;
    expect(w).not.toHaveProperty("blocked");
    expect(w).not.toHaveProperty("waitingOn");
  });

  it("gives the view each task's subtree, pre-order, done ones included, with blocked state", () => {
    const tasks = [
      task({ id: "p", title: "Parent", tags: ["x"], sequential: true }),
      task({ id: "c1", title: "First", parentId: "p", position: 1, completedAt: NOW - 1 }),
      task({ id: "c2", title: "Second", parentId: "p", position: 2, startDate: "2026-07-11", dueDate: "2026-07-15" }),
      task({ id: "g1", title: "Grandchild", parentId: "c2", position: 1 }),
      task({ id: "c3", title: "Third", parentId: "p", position: 3 }),
      task({ id: "other", title: "Other", tags: ["y"] }),
    ];
    const out = projectFlows(
      input(tasks, { dependencies: [dep("g1", "other")], withSubtasks: true }),
    );
    const p = out.streams.flatMap((s) => s.tasks).find((t) => t.id === "p")!;
    expect(p.subtasks).toEqual<FlowSubtaskOut[]>([
      { id: "c1", title: "First", parentId: "p", depth: 1, done: true },
      { id: "c2", title: "Second", parentId: "p", depth: 1, done: false, start: "2026-07-11", due: "2026-07-15" },
      {
        id: "g1",
        title: "Grandchild",
        parentId: "c2",
        depth: 2,
        done: false,
        blocked: true,
        waitingOn: [{ id: "other", title: "Other" }],
      },
      // "do in order": the second open subtask waits for the first.
      { id: "c3", title: "Third", parentId: "p", depth: 1, done: false, blocked: true },
    ]);
    expect(out.streams.flatMap((s) => s.tasks).find((t) => t.id === "other")!.subtasks).toEqual([]);
    expect(JSON.stringify(out)).not.toContain("SECRET");
  });

  it("caps the subtasks per task and never goes deeper than MAX_DEPTH", () => {
    const root = task({ id: "r", title: "Root", tags: ["x"] });
    const kids = Array.from({ length: MAX_FLOW_SUBTASKS + 20 }, (_, i) =>
      task({ id: `k${i}`, title: `Kid ${i}`, parentId: "r", position: i }),
    );
    const capped = projectFlows(input([root, ...kids], { withSubtasks: true }));
    expect(capped.streams[0].tasks[0].subtasks).toHaveLength(MAX_FLOW_SUBTASKS);

    // A chain one level deeper than the database allows (malformed data).
    const chain = [
      root,
      task({ id: "d1", title: "1", parentId: "r" }),
      task({ id: "d2", title: "2", parentId: "d1" }),
      task({ id: "d3", title: "3", parentId: "d2" }),
      task({ id: "d4", title: "4", parentId: "d3" }),
    ];
    const deep = projectFlows(input(chain, { withSubtasks: true }));
    expect(deep.streams[0].tasks[0].subtasks!.map((s) => [s.id, s.depth])).toEqual([
      ["d1", 1],
      ["d2", 2],
      ["d3", 3],
    ]);
  });
});

describe("projectTaskDetail", () => {
  it("lists what the task waits for and what waits for it, and each subtask's blocked state", () => {
    const root = task({ id: "r", title: "Root", sequential: true });
    const all = [
      root,
      task({ id: "a", title: "A", parentId: "r", position: 1, sequential: true, dueDate: "2026-07-20" }),
      task({ id: "b", title: "B", parentId: "r", position: 2, startDate: "2026-07-12" }),
      task({ id: "up", title: "Upstream", completedAt: NOW }),
      task({ id: "down", title: "Downstream" }),
      task({ id: "ext", title: "External" }),
    ];
    const deps = [dep("r", "up"), dep("down", "r"), dep("a", "ext")];
    const out = projectTaskDetail(root, all, deps);
    expect(out.sequential).toBe(true);
    expect(out.blockedBy).toEqual([{ id: "up", title: "Upstream", done: true }]);
    expect(out.blocks).toEqual([{ id: "down", title: "Downstream", done: false }]);
    expect(out.subtasks).toEqual([
      { id: "a", title: "A", done: false, depth: 1, sequential: true, blocked: true, due: "2026-07-20", blockedBy: ["ext"] },
      { id: "b", title: "B", done: false, depth: 1, sequential: false, blocked: true, start: "2026-07-12" },
    ]);
  });

  it("returns the editable fields and the subtree, parent before child, without descriptions", () => {
    const root = task({ id: "r", title: "Root", tags: ["t"], dueDate: "2026-07-20", priority: 2 });
    const all = [
      root,
      task({ id: "b", title: "Second", parentId: "r", position: 2 }),
      task({ id: "a", title: "First", parentId: "r", position: 1, completedAt: NOW }),
      task({ id: "a1", title: "Nested", parentId: "a" }),
      task({ id: "other", title: "Elsewhere" }),
    ];
    const out = projectTaskDetail(root, all);
    expect(out).toMatchObject({ id: "r", title: "Root", done: false, dueDate: "2026-07-20", priority: 2, tags: ["t"] });
    expect(out.startDate).toBeUndefined();
    expect(out.subtasks).toEqual([
      { id: "a", title: "First", done: true, depth: 1, sequential: false, blocked: false },
      { id: "a1", title: "Nested", done: false, depth: 2, sequential: false, blocked: false },
      { id: "b", title: "Second", done: false, depth: 1, sequential: false, blocked: false },
    ]);
    expect(out).toMatchObject({ sequential: false, blockedBy: [], blocks: [] });
    expect(JSON.stringify(out)).not.toContain("SECRET");
  });

  it("survives a cycle in the data", () => {
    const a = task({ id: "a", title: "A", parentId: "b" });
    const b = task({ id: "b", title: "B", parentId: "a" });
    expect(projectTaskDetail(a, [a, b]).subtasks.map((s) => s.id)).toEqual(["b"]);
  });
});
