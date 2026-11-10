import { describe, it, expect } from "vitest";
import {
  DEFAULT_FLOWS_FILTER,
  DEFAULT_FLOWS_DISPLAY,
  activeFilterCount,
  coerceFlowsDisplay,
  filterLanes,
  flowOrderOf,
  groupLanes,
  sortLanes,
  type FlowsDisplayCtx,
  type FlowsFilter,
} from "@/lib/tasks/flows-display";
import type { FlowLane } from "@/lib/tasks/flows-layout";
import type { Board, Category, Collection, Member, TaskRow } from "@/lib/types";

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
    tags: [],
    createdAt: T0,
    updatedAt: T0,
    updatedBy: null,
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
    checkpoints: [],
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

const collections = [
  { id: "k2", workspaceId: "w", ownerId: null, name: "Zeta", color: "#111111", sortOrder: 0 },
  { id: "k1", workspaceId: "w", ownerId: null, name: "Alpha", color: "#222222", sortOrder: 1 },
] as Collection[];
const members = [
  { id: "m1", name: "Ana", color: "#c2410c" },
  { id: "m2", name: "Ben", color: "#0369a1" },
] as Member[];

const ctx: FlowsDisplayCtx = {
  boardsById: new Map(boards.map((b) => [b.id, b])),
  boardOrder: new Map(boards.map((b, i) => [b.id, i])),
  categoriesById: new Map(categories.map((c) => [c.id, c])),
  collectionsById: new Map(collections.map((c) => [c.id, c])),
  collectionOrder: new Map(collections.map((c, i) => [c.id, i])),
  membersById: new Map(members.map((m) => [m.id, m])),
  memberOrder: new Map(members.map((m, i) => [m.id, i])),
  today: "2026-06-10",
  attention: "combined",
  labels: {
    noStatus: "No status",
    noCategory: "No category",
    noTag: "No tag",
    noCollection: "No collection",
    unassigned: "Unassigned",
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

describe("tag and assignee filters", () => {
  const lanes = [
    lane({ id: "a", tags: ["home", "urgent"], assigneeId: "m1" }),
    lane({ id: "b", tags: [], assigneeId: null }),
    lane({ id: "c", tags: ["work"], assigneeId: "m2" }),
  ];

  it("matches a lane having ANY listed tag; null is the untagged bucket", () => {
    expect(ids(filterLanes(lanes, { ...DEFAULT_FLOWS_FILTER, tags: ["urgent", "work"] }))).toEqual(["a", "c"]);
    expect(ids(filterLanes(lanes, { ...DEFAULT_FLOWS_FILTER, tags: [null] }))).toEqual(["b"]);
    expect(ids(filterLanes(lanes, { ...DEFAULT_FLOWS_FILTER, tags: [null, "home"] }))).toEqual(["a", "b"]);
  });

  it("filters by assignee with null = unassigned", () => {
    expect(ids(filterLanes(lanes, { ...DEFAULT_FLOWS_FILTER, assigneeIds: ["m2"] }))).toEqual(["c"]);
    expect(ids(filterLanes(lanes, { ...DEFAULT_FLOWS_FILTER, assigneeIds: [null, "m1"] }))).toEqual(["a", "b"]);
  });

  it("counts them in activeFilterCount", () => {
    expect(activeFilterCount({ ...DEFAULT_FLOWS_FILTER, tags: ["x"], assigneeIds: [null] })).toBe(2);
  });
});

describe("attention sort", () => {
  const lanes = [
    lane({ id: "calm", dueDate: "2026-08-01", priority: 1 }),
    lane({ id: "hot", dueDate: "2026-06-09", priority: 3 }),
    lane({ id: "mid", dueDate: "2026-06-17", priority: 2 }),
    lane({ id: "done", dueDate: "2026-06-09", priority: 3, completedAt: T0 }),
  ];
  const attn = { today: "2026-06-10", mode: "combined" as const };

  it("desc puts the most pressing first, asc the reverse", () => {
    expect(ids(sortLanes(lanes, "attention", "desc", undefined, attn))).toEqual(["hot", "mid", "calm", "done"]);
    expect(ids(sortLanes(lanes, "attention", "asc", undefined, attn))).toEqual(["done", "calm", "mid", "hot"]);
  });

  it("is used by groupLanes through the ctx", () => {
    const [g] = groupLanes(lanes, "none", "attention", "desc", ctx);
    expect(ids(g.lanes)[0]).toBe("hot");
  });

  it("keeps input order without an attention context", () => {
    expect(ids(sortLanes(lanes, "attention", "desc"))).toEqual(["calm", "hot", "mid", "done"]);
  });
});

describe("groupLanes: tag, collection, assignee", () => {
  it("puts a multi-tag lane in each tag bucket, alphabetical, untagged last", () => {
    const both = lane({ id: "both", tags: ["work", "home"] });
    const lanes = [lane({ id: "plain" }), both, lane({ id: "w", tags: ["work"] })];
    const groups = groupLanes(lanes, "tag", "manual", "asc", ctx);
    expect(groups.map((g) => g.label)).toEqual(["home", "work", "No tag"]);
    expect(ids(groups[0].lanes)).toEqual(["both"]);
    expect(ids(groups[1].lanes)).toEqual(["both", "w"]);
    expect(groups[0].lanes[0]).toBe(groups[1].lanes[0]); // the same lane object
    expect(new Set(groups.map((g) => g.key)).size).toBe(3);
    expect(groups.every((g) => g.color === undefined)).toBe(true);
  });

  it("a tag literally named none does not collide with the untagged bucket", () => {
    const groups = groupLanes([lane({ id: "a", tags: ["none"] }), lane({ id: "b" })], "tag", "manual", "asc", ctx);
    expect(groups.map((g) => g.label)).toEqual(["none", "No tag"]);
  });

  it("orders collection buckets by the collection's order, none last", () => {
    const lanes = [
      lane({ id: "a", collectionId: "k1" }),
      lane({ id: "b", collectionId: null }),
      lane({ id: "c", collectionId: "k2" }),
    ];
    const groups = groupLanes(lanes, "collection", "manual", "asc", ctx);
    expect(groups.map((g) => g.label)).toEqual(["Zeta", "Alpha", "No collection"]);
  });

  it("orders assignee buckets by member order, unassigned last, with the member color", () => {
    const lanes = [
      lane({ id: "a", assigneeId: null }),
      lane({ id: "b", assigneeId: "m2" }),
      lane({ id: "c", assigneeId: "m1" }),
    ];
    const groups = groupLanes(lanes, "assignee", "manual", "asc", ctx);
    expect(groups.map((g) => g.label)).toEqual(["Ana", "Ben", "Unassigned"]);
    expect(groups[0].color).toBe("#c2410c");
    expect(groups[2].color).toBeUndefined();
  });
});

describe("coerceFlowsDisplay", () => {
  it("falls back to defaults on garbage", () => {
    for (const bad of [null, undefined, 5, "x", [], { filter: "x", groupBy: 3, mode: {}, tags: 1 }]) {
      expect(coerceFlowsDisplay(bad)).toEqual(DEFAULT_FLOWS_DISPLAY);
    }
  });

  it("upgrades an old-schema blob, keeping its fields and defaulting the new ones", () => {
    const old = {
      filter: { boardIds: ["b1"], categoryIds: [null], priorities: [3], done: "open", milestone: "all", privacy: "all" },
      groupBy: "status",
      sortBy: "due",
      sortDir: "desc",
    };
    const out = coerceFlowsDisplay(old);
    expect(out.filter).toEqual({ ...DEFAULT_FLOWS_FILTER, boardIds: ["b1"], categoryIds: [null], priorities: [3], done: "open" });
    expect(out.groupBy).toBe("status");
    expect(out.sortDir).toBe("desc");
    expect(out.mode).toBe("tasks");
    expect(out.attention).toBe("combined");
    expect(out.scope).toBe("collection");
  });

  it("drops wrong-shaped individual fields only", () => {
    const out = coerceFlowsDisplay({ groupBy: "tag", mode: "bogus", filter: { tags: [1], assigneeIds: ["m1", null] } });
    expect(out.groupBy).toBe("tag");
    expect(out.mode).toBe("tasks");
    expect(out.filter.tags).toBeNull();
    expect(out.filter.assigneeIds).toEqual(["m1", null]);
  });

  it("round-trips a full object through JSON", () => {
    const full = {
      filter: {
        boardIds: ["b1"],
        categoryIds: ["c1", null],
        priorities: [0, 2],
        tags: ["x", null],
        assigneeIds: [null, "m1"],
        done: "done",
        milestone: "only",
        privacy: "private",
      },
      groupBy: "assignee",
      sortBy: "attention",
      sortDir: "desc",
      mode: "streams",
      attention: "deadline",
      scope: "all",
    } as const;
    expect(coerceFlowsDisplay(JSON.parse(JSON.stringify(full)))).toEqual(full);
  });
});
