import { describe, it, expect } from "vitest";
import {
  DEFAULT_FLOWS_FILTER,
  activeFilterCount,
  filterLanes,
  flowOrderOf,
  groupLanes,
  sortLanes,
  type FlowsDisplayCtx,
  type FlowsFilter,
} from "@/lib/tasks/flows-display";
import type { FlowLane } from "@/lib/tasks/flows-layout";
import type { Board, Category, TaskRow } from "@/lib/types";

const T0 = Date.UTC(2026, 5, 1);
const DAY = 86_400_000;

function task(over: Partial<TaskRow>): TaskRow {
  return {
    id: "t",
    workspaceId: "w",
    ownerId: "me",
    assigneeId: null,
    parentId: null,
    collectionId: "col",
    categoryId: null,
    title: "t",
    description: null,
    isPrivate: false,
    color: null,
    boardId: "b1",
    priority: null,
    dueDate: null,
    startDate: null,
    isMilestone: false,
    position: 0,
    sequential: false,
    completedAt: null,
    attributes: {},
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

function lane(over: Partial<TaskRow> & { startMs?: number; endMs?: number | null }): FlowLane {
  const { startMs, endMs, ...taskOver } = over;
  const t = task(taskOver);
  return {
    task: t,
    startMs: startMs ?? t.createdAt,
    endMs: endMs ?? null,
    nodes: [],
    milestone: t.isMilestone,
    branches: [],
    done: t.completedAt != null,
  };
}

function board(over: Partial<Board>): Board {
  return {
    id: "b1",
    workspaceId: "w",
    collectionId: "col",
    name: "To Do",
    lineStyle: "solid",
    position: 0,
    isDone: false,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

function category(over: Partial<Category>): Category {
  return { id: "c1", workspaceId: "w", ownerId: null, name: "Home", color: "#15803d", sortOrder: 0, ...over };
}

const boards = [board({ id: "b1", name: "To Do", position: 0 }), board({ id: "b2", name: "Done", position: 1, isDone: true })];
const categories = [category({ id: "c1", name: "Home", sortOrder: 0 }), category({ id: "c2", name: "Work", sortOrder: 1, color: "#0369a1" })];

const ctx: FlowsDisplayCtx = {
  boardsById: new Map(boards.map((b) => [b.id, b])),
  boardOrder: new Map(boards.map((b, i) => [b.id, i])),
  categoriesById: new Map(categories.map((c) => [c.id, c])),
  labels: {
    noStatus: "No status",
    noCategory: "No category",
    priority: { 0: "None", 1: "Low", 2: "Medium", 3: "High" },
  },
};

const ids = (lanes: FlowLane[]) => lanes.map((l) => l.task.id);

describe("filterLanes", () => {
  const lanes = [
    lane({ id: "a", boardId: "b1", priority: 3, categoryId: "c1", isPrivate: true }),
    lane({ id: "b", boardId: "b2", priority: null, categoryId: null, completedAt: T0 + DAY }),
    lane({ id: "c", boardId: "b1", priority: 1, categoryId: "c2", isMilestone: true }),
  ];

  it("passes everything through with the default (all-null) filter", () => {
    expect(ids(filterLanes(lanes, DEFAULT_FLOWS_FILTER))).toEqual(["a", "b", "c"]);
  });

  it("filters by board", () => {
    expect(ids(filterLanes(lanes, { ...DEFAULT_FLOWS_FILTER, boardIds: ["b1"] }))).toEqual(["a", "c"]);
  });

  it("filters by category including the no-category bucket", () => {
    expect(ids(filterLanes(lanes, { ...DEFAULT_FLOWS_FILTER, categoryIds: [null] }))).toEqual(["b"]);
    expect(ids(filterLanes(lanes, { ...DEFAULT_FLOWS_FILTER, categoryIds: ["c1", "c2"] }))).toEqual(["a", "c"]);
  });

  it("filters by priority, treating null as none (0)", () => {
    expect(ids(filterLanes(lanes, { ...DEFAULT_FLOWS_FILTER, priorities: [3] }))).toEqual(["a"]);
    expect(ids(filterLanes(lanes, { ...DEFAULT_FLOWS_FILTER, priorities: [0] }))).toEqual(["b"]);
  });

  it("filters by done state, milestone, and privacy", () => {
    expect(ids(filterLanes(lanes, { ...DEFAULT_FLOWS_FILTER, done: "open" }))).toEqual(["a", "c"]);
    expect(ids(filterLanes(lanes, { ...DEFAULT_FLOWS_FILTER, done: "done" }))).toEqual(["b"]);
    expect(ids(filterLanes(lanes, { ...DEFAULT_FLOWS_FILTER, milestone: "only" }))).toEqual(["c"]);
    expect(ids(filterLanes(lanes, { ...DEFAULT_FLOWS_FILTER, milestone: "exclude" }))).toEqual(["a", "b"]);
    expect(ids(filterLanes(lanes, { ...DEFAULT_FLOWS_FILTER, privacy: "private" }))).toEqual(["a"]);
    expect(ids(filterLanes(lanes, { ...DEFAULT_FLOWS_FILTER, privacy: "shared" }))).toEqual(["b", "c"]);
  });
});

describe("sortLanes", () => {
  it("sorts by title, flipping with direction", () => {
    const lanes = [lane({ id: "c", title: "Carrot" }), lane({ id: "a", title: "Apple" }), lane({ id: "b", title: "Banana" })];
    expect(ids(sortLanes(lanes, "title", "asc"))).toEqual(["a", "b", "c"]);
    expect(ids(sortLanes(lanes, "title", "desc"))).toEqual(["c", "b", "a"]);
  });

  it("sorts by due date with nulls always last, regardless of direction", () => {
    const lanes = [
      lane({ id: "none", dueDate: null }),
      lane({ id: "late", dueDate: "2026-06-20" }),
      lane({ id: "soon", dueDate: "2026-06-05" }),
    ];
    expect(ids(sortLanes(lanes, "due", "asc"))).toEqual(["soon", "late", "none"]);
    expect(ids(sortLanes(lanes, "due", "desc"))).toEqual(["late", "soon", "none"]);
  });

  it("sorts by priority with null (none) last", () => {
    const lanes = [lane({ id: "lo", priority: 1 }), lane({ id: "none", priority: null }), lane({ id: "hi", priority: 3 })];
    expect(ids(sortLanes(lanes, "priority", "desc"))).toEqual(["hi", "lo", "none"]);
  });

  it("manual without an anchor preserves the input (baseline) order", () => {
    const lanes = [lane({ id: "c" }), lane({ id: "a" }), lane({ id: "b" })];
    expect(ids(sortLanes(lanes, "manual", "asc"))).toEqual(["c", "a", "b"]);
  });

  it("manual with an anchor sorts by it (the hand-set flowPos order)", () => {
    const lanes = [
      lane({ id: "c", attributes: { flowPos: 5 } }),
      lane({ id: "a", attributes: { flowPos: 1 } }),
      lane({ id: "b", attributes: { flowPos: 3 } }),
    ];
    const anchor = (l: FlowLane) => flowOrderOf(l.task) ?? 0;
    expect(ids(sortLanes(lanes, "manual", "asc", anchor))).toEqual(["a", "b", "c"]);
  });
});

describe("groupLanes", () => {
  it("returns a single headerless bucket for groupBy none, preserving baseline order on manual", () => {
    const lanes = [lane({ id: "b", position: 2 }), lane({ id: "a", position: 1 })];
    const groups = groupLanes(lanes, "none", "manual", "asc", ctx);
    expect(groups).toHaveLength(1);
    expect(groups[0].header).toBe(false);
    expect(ids(groups[0].lanes)).toEqual(["b", "a"]); // input order kept
    // an explicit sort key re-orders the flat list
    const sorted = groupLanes(lanes, "none", "manual", "asc", ctx);
    expect(sorted[0].lanes).toHaveLength(2);
  });

  it("groups by status ordered by board position, no-board bucket last", () => {
    const lanes = [
      lane({ id: "done1", boardId: "b2" }),
      lane({ id: "todo1", boardId: "b1" }),
      lane({ id: "stray", boardId: null }),
    ];
    const groups = groupLanes(lanes, "status", "manual", "asc", ctx);
    expect(groups.map((g) => g.key)).toEqual(["b1", "b2", "none"]);
    expect(groups.map((g) => g.label)).toEqual(["To Do", "Done", "No status"]);
    expect(groups.every((g) => g.header)).toBe(true);
  });

  it("groups by category including a No category bucket with a swatch color", () => {
    const lanes = [
      lane({ id: "home", categoryId: "c1" }),
      lane({ id: "none", categoryId: null }),
      lane({ id: "work", categoryId: "c2" }),
    ];
    const groups = groupLanes(lanes, "category", "manual", "asc", ctx);
    expect(groups.map((g) => g.label)).toEqual(["Home", "Work", "No category"]);
    expect(groups[0].color).toBe("#15803d");
    expect(groups.at(-1)?.color).toBeUndefined();
  });

  it("groups by priority high to low", () => {
    const lanes = [lane({ id: "lo", priority: 1 }), lane({ id: "hi", priority: 3 }), lane({ id: "none", priority: null })];
    const groups = groupLanes(lanes, "priority", "manual", "asc", ctx);
    expect(groups.map((g) => g.label)).toEqual(["High", "Low", "None"]);
  });
});

describe("activeFilterCount", () => {
  it("counts each constrained dimension", () => {
    expect(activeFilterCount(DEFAULT_FLOWS_FILTER)).toBe(0);
    const f: FlowsFilter = { ...DEFAULT_FLOWS_FILTER, boardIds: ["b1"], done: "open", privacy: "private" };
    expect(activeFilterCount(f)).toBe(3);
  });
});
