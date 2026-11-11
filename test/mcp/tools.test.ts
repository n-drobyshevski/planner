import { describe, it, expect, vi, beforeEach } from "vitest";

// --- mock the data layer + the auth seam ----------------------------------
vi.mock("@/lib/supabase/queries", () => ({
  fetchWorkspaceBundle: vi.fn(),
  fetchWindow: vi.fn(),
  fetchTasks: vi.fn(),
  fetchTaskStreams: vi.fn(),
  fetchTaskDependencies: vi.fn(async () => []),
  fetchSleepLogs: vi.fn(),
}));
vi.mock("@/lib/supabase/mutations", () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  addDependency: vi.fn(),
  removeDependency: vi.fn(async () => undefined),
  StaleWriteError: class StaleWriteError extends Error {},
}));
vi.mock("@/lib/recurrence/expand", () => ({ expandEvents: vi.fn(() => []) }));
vi.mock("@/lib/mcp/auth", () => ({
  mcpContext: () => ({ sb: {}, memberId: "m1", workspaceId: "w1" }),
}));

import { registerTools } from "@/lib/mcp/tools";
import * as q from "@/lib/supabase/queries";
import * as m from "@/lib/supabase/mutations";
import * as expand from "@/lib/recurrence/expand";
import type { Occurrence } from "@/lib/types";

/** Minimal McpServer stand-in that captures registered tool handlers. */
function collectTools() {
  const handlers = new Map<string, (args: unknown, extra: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>>();
  const server = {
    registerTool(name: string, _config: unknown, cb: (args: unknown, extra: unknown) => unknown) {
      handlers.set(name, cb as never);
    },
    registerResource() {},
  };
  registerTools(server as never);
  return async (name: string, args: unknown = {}) => {
    const cb = handlers.get(name);
    if (!cb) throw new Error(`tool ${name} not registered`);
    const res = await cb(args, {});
    const text = res.content[0].text;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = undefined;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { isError: res.isError ?? false, data };
  };
}

beforeEach(() => vi.clearAllMocks());

describe("MCP tools", () => {
  it("registers the expected tool surface", () => {
    const names: string[] = [];
    registerTools({ registerTool: (n: string) => names.push(n), registerResource() {} } as never);
    expect(names).toEqual(
      expect.arrayContaining([
        "get_workspace",
        "get_agenda",
        "list_events",
        "create_event",
        "update_event",
        "delete_event",
        "list_tasks",
        "get_flows",
        "show_flows",
        "create_task",
        "update_task",
        "complete_task",
        "delete_task",
        "get_sleep_summary",
      ]),
    );
  });

  it("list_tasks filters out completed and subtasks when asked", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([
      { id: "t1", title: "Open top", parentId: null, completedAt: null },
      { id: "t2", title: "Done top", parentId: null, completedAt: 123 },
      { id: "t3", title: "Subtask", parentId: "t1", completedAt: null },
    ] as never);
    const call = collectTools();
    const res = await call("list_tasks", { includeCompleted: false, includeSubtasks: false });
    expect(res.data.count).toBe(1);
    expect(res.data.tasks[0].id).toBe("t1");
  });

  it("delete_task previews without confirm, deletes with confirm", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([
      { id: "t1", title: "Doomed", parentId: null, completedAt: null },
      { id: "t2", title: "Child", parentId: "t1", completedAt: null },
    ] as never);
    const call = collectTools();

    const preview = await call("delete_task", { id: "t1" });
    expect(preview.data.preview).toBe(true);
    expect(preview.data.wouldDelete.subtasks).toBe(1);
    expect(m.deleteTask).not.toHaveBeenCalled();

    const done = await call("delete_task", { id: "t1", confirm: true });
    expect(done.data.deleted).toBe(true);
    expect(m.deleteTask).toHaveBeenCalledWith({}, "t1");
  });

  it("delete_task refuses an id the member cannot see", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([] as never);
    const call = collectTools();
    const res = await call("delete_task", { id: "nope", confirm: true });
    expect(res.isError).toBe(true);
    expect(m.deleteTask).not.toHaveBeenCalled();
  });

  it("complete_task moves the task to its collection's done board", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([
      { id: "t1", title: "Task", parentId: null, completedAt: null, collectionId: "c1", boardId: "b0" },
    ] as never);
    vi.mocked(q.fetchWorkspaceBundle).mockResolvedValue({
      boards: [
        { id: "b0", collectionId: "c1", isDone: false },
        { id: "b1", collectionId: "c1", isDone: true },
      ],
    } as never);
    vi.mocked(m.updateTask).mockResolvedValue({ id: "t1", title: "Task" } as never);
    const call = collectTools();
    await call("complete_task", { id: "t1" });
    const patch = vi.mocked(m.updateTask).mock.calls[0][2];
    expect(patch.boardId).toBe("b1");
    expect(typeof patch.completedAt).toBe("number");
  });

  it("create_event maps ISO times to ms and stamps owner/workspace", async () => {
    vi.mocked(m.createEvent).mockResolvedValue({ id: "e1", title: "Lunch", start: 0 } as never);
    const call = collectTools();
    await call("create_event", {
      title: "Lunch",
      start: "2026-07-01T12:00:00.000Z",
      end: "2026-07-01T13:00:00.000Z",
      timeZone: "Europe/Berlin",
    });
    const input = vi.mocked(m.createEvent).mock.calls[0][1];
    expect(input.ownerId).toBe("m1");
    expect(input.workspaceId).toBe("w1");
    expect(input.start).toBe(Date.parse("2026-07-01T12:00:00.000Z"));
    expect(input.timeZone).toBe("Europe/Berlin");
  });

  it("create_event passes isPrivate and clientRequestId through (default isPrivate: false)", async () => {
    vi.mocked(m.createEvent).mockResolvedValue({ id: "e1", title: "Lunch", start: 0 } as never);
    const call = collectTools();
    await call("create_event", {
      title: "Lunch",
      start: "2026-07-01T12:00:00.000Z",
      end: "2026-07-01T13:00:00.000Z",
    });
    expect(vi.mocked(m.createEvent).mock.calls[0][1].isPrivate).toBe(false);

    await call("create_event", {
      title: "Therapy",
      start: "2026-07-01T12:00:00.000Z",
      end: "2026-07-01T13:00:00.000Z",
      isPrivate: true,
      clientRequestId: "anchor:xyz",
    });
    const input = vi.mocked(m.createEvent).mock.calls[1][1];
    expect(input.isPrivate).toBe(true);
    expect(input.clientRequestId).toBe("anchor:xyz");
  });

  it("create_event keeps a UTC-midnight all-day range as is, even west of UTC", async () => {
    vi.mocked(m.createEvent).mockResolvedValue({ id: "e1", title: "Trip", start: 0 } as never);
    const call = collectTools();
    await call("create_event", {
      title: "Trip",
      start: "2026-09-25T00:00:00.000Z",
      end: "2026-09-26T00:00:00.000Z",
      allDay: true,
      timeZone: "America/New_York",
    });
    const input = vi.mocked(m.createEvent).mock.calls[0][1];
    expect(input.start).toBe(Date.UTC(2026, 8, 25));
    expect(input.end).toBe(Date.UTC(2026, 8, 26));
  });

  it("create_event normalizes a local-midnight all-day range to UTC-midnight dates", async () => {
    vi.mocked(m.createEvent).mockResolvedValue({ id: "e1", title: "Trip", start: 0 } as never);
    const call = collectTools();
    await call("create_event", {
      title: "Trip",
      start: "2026-09-24T21:00:00.000Z", // 2026-09-25 00:00 in Moscow
      end: "2026-09-25T21:00:00.000Z",
      allDay: true,
      timeZone: "Europe/Moscow",
    });
    const input = vi.mocked(m.createEvent).mock.calls[0][1];
    expect(input.start).toBe(Date.UTC(2026, 8, 25));
    expect(input.end).toBe(Date.UTC(2026, 8, 26));
  });

  it("create_task passes clientRequestId through", async () => {
    vi.mocked(m.createTask).mockResolvedValue({ id: "t1", title: "Task" } as never);
    const call = collectTools();
    await call("create_task", { title: "Task", clientRequestId: "anchor:t1" });
    expect(vi.mocked(m.createTask).mock.calls[0][1].clientRequestId).toBe("anchor:t1");
  });
});

describe("get_agenda", () => {
  const ME = "m1";
  const PARTNER = "m2";

  function occ(partial: Partial<Occurrence> & { title: string }): Occurrence {
    return {
      key: `${partial.eventId ?? "e"}:${partial.occurrenceDate ?? 0}`,
      eventId: "e1",
      occurrenceDate: 0,
      start: 0,
      end: 3_600_000,
      allDay: false,
      inactive: false,
      status: "confirmed",
      description: null,
      location: null,
      categoryId: null,
      color: null,
      kind: "event",
      ownerId: ME,
      isPrivate: false,
      isShared: false,
      hiddenFromPublic: false,
      taskId: null,
      attributes: {},
      isRecurring: false,
      isException: false,
      ...partial,
    };
  }

  beforeEach(() => {
    vi.mocked(q.fetchWindow).mockResolvedValue({ events: [], overrides: [] } as never);
    vi.mocked(q.fetchTasks).mockResolvedValue([] as never);
    vi.mocked(q.fetchWorkspaceBundle).mockResolvedValue({ boards: [], categories: [] } as never);
    vi.mocked(expand.expandEvents).mockReturnValue([]);
  });

  it("windows a non-UTC local day DST-correctly (America/New_York, EDT = UTC-4)", async () => {
    const call = collectTools();
    await call("get_agenda", { date: "2026-09-23", timeZone: "America/New_York" });
    const win = vi.mocked(q.fetchWindow).mock.calls[0][2];
    expect(new Date(win.start).toISOString()).toBe("2026-09-23T04:00:00.000Z");
    expect(new Date(win.end).toISOString()).toBe("2026-09-24T04:00:00.000Z");
  });

  it("windows a fall-back DST day as 25 real hours (America/New_York, Nov 1 2026)", async () => {
    const call = collectTools();
    await call("get_agenda", { date: "2026-11-01", timeZone: "America/New_York" });
    const win = vi.mocked(q.fetchWindow).mock.calls[0][2];
    expect(new Date(win.start).toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(new Date(win.end).toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(win.end - win.start).toBe(25 * 60 * 60 * 1000);
  });

  it("windows a spring-forward DST day as 23 real hours (America/New_York, Mar 8 2026)", async () => {
    const call = collectTools();
    await call("get_agenda", { date: "2026-03-08", timeZone: "America/New_York" });
    const win = vi.mocked(q.fetchWindow).mock.calls[0][2];
    expect(new Date(win.start).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(new Date(win.end).toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(win.end - win.start).toBe(23 * 60 * 60 * 1000);
  });

  it("windows 2 local days when days: 2", async () => {
    const call = collectTools();
    await call("get_agenda", { date: "2026-09-23", timeZone: "UTC", days: 2 });
    const win = vi.mocked(q.fetchWindow).mock.calls[0][2];
    expect(new Date(win.start).toISOString()).toBe("2026-09-23T00:00:00.000Z");
    expect(new Date(win.end).toISOString()).toBe("2026-09-25T00:00:00.000Z");
  });

  it("drops the partner in 'none' mode, gives busy times in 'busy', titles in 'shared'", async () => {
    vi.mocked(expand.expandEvents).mockReturnValue([
      occ({ eventId: "p1", title: "Partner thing", ownerId: PARTNER }),
    ]);
    const call = collectTools();

    const none = await call("get_agenda", { date: "2026-09-23", timeZone: "UTC" });
    expect(none.data.events).toEqual([]);

    const busy = await call("get_agenda", { date: "2026-09-23", timeZone: "UTC", partner: "busy" });
    expect(busy.data.events).toEqual([
      { owner: "partner", busy: true, start: new Date(0).toISOString(), end: new Date(3_600_000).toISOString(), allDay: false },
    ]);

    const shared = await call("get_agenda", { date: "2026-09-23", timeZone: "UTC", partner: "shared" });
    expect(shared.data.events).toEqual([
      { owner: "partner", title: "Partner thing", start: new Date(0).toISOString(), end: new Date(3_600_000).toISOString(), allDay: false },
    ]);
  });

  it("a recurring partner series (several expanded occurrences) never leaks an id or private titles", async () => {
    vi.mocked(expand.expandEvents).mockReturnValue([
      occ({ eventId: "p1", occurrenceDate: 0, title: "Standup", ownerId: PARTNER, start: 0, end: 900_000 }),
      occ({ eventId: "p1", occurrenceDate: 86_400_000, title: "Standup", ownerId: PARTNER, start: 86_400_000, end: 87_300_000 }),
    ]);
    const call = collectTools();
    const res = await call("get_agenda", { date: "2026-09-23", timeZone: "UTC", partner: "shared" });
    expect(res.data.events).toHaveLength(2);
    for (const e of res.data.events) {
      expect(e).not.toHaveProperty("id");
      expect(e.owner).toBe("partner");
    }
  });

  it("expands a real recurring partner series (unmocked expandEvents) without leaking an id", async () => {
    const real = await vi.importActual<typeof import("@/lib/recurrence/expand")>(
      "@/lib/recurrence/expand",
    );
    vi.mocked(expand.expandEvents).mockImplementation(real.expandEvents);
    vi.mocked(q.fetchWindow).mockResolvedValue({
      events: [
        {
          id: "p1",
          workspaceId: "w1",
          ownerId: PARTNER,
          categoryId: null,
          title: "Standup",
          description: "internal notes",
          location: null,
          isPrivate: false,
          isShared: false,
          hiddenFromPublic: false,
          color: null,
          kind: "event",
          allDay: false,
          inactive: false,
          status: "confirmed",
          start: Date.UTC(2026, 8, 23, 9, 0),
          end: Date.UTC(2026, 8, 23, 9, 15),
          timeZone: "UTC",
          rrule: "FREQ=DAILY;COUNT=3",
          recurrenceEndsAt: null,
          taskId: null,
          attributes: {},
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      overrides: [],
    } as never);
    const call = collectTools();
    const res = await call("get_agenda", {
      date: "2026-09-23",
      timeZone: "UTC",
      days: 2,
      partner: "shared",
    });
    expect(res.data.events).toHaveLength(2); // days:2 window covers 2 of the 3 daily occurrences
    for (const e of res.data.events) {
      expect(e).not.toHaveProperty("id");
      expect(e.owner).toBe("partner");
      expect(e.title).toBe("Standup");
    }
  });

  it("includes an overdue own task and a due-in-window task; excludes one due later", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([
      { id: "t1", title: "Overdue", ownerId: ME, completedAt: null, dueDate: "2026-09-20", boardId: null, collectionId: null, parentId: null },
      { id: "t2", title: "Due today", ownerId: ME, completedAt: null, dueDate: "2026-09-23", boardId: null, collectionId: null, parentId: null },
      { id: "t3", title: "Later", ownerId: ME, completedAt: null, dueDate: "2026-10-01", boardId: null, collectionId: null, parentId: null },
    ] as never);
    const call = collectTools();
    const res = await call("get_agenda", { date: "2026-09-23", timeZone: "UTC" });
    const byId = Object.fromEntries(res.data.tasks.map((t: { id: string }) => [t.id, t]));
    expect(byId.t1.overdue).toBe(true);
    expect(byId.t2.overdue).toBe(false);
    expect(byId.t3).toBeUndefined();
  });

  it("is read-only: never touches the write layer", async () => {
    const call = collectTools();
    await call("get_agenda", { date: "2026-09-23", timeZone: "UTC" });
    expect(m.createEvent).not.toHaveBeenCalled();
    expect(m.createTask).not.toHaveBeenCalled();
  });
});

describe("tags and streams", () => {
  const baseTask = {
    workspaceId: "w1",
    ownerId: "m1",
    assigneeId: null,
    parentId: null,
    collectionId: null,
    categoryId: null,
    description: "PRIVATE NOTE",
    isPrivate: false,
    boardId: null,
    priority: null,
    dueDate: null,
    startDate: null,
    isMilestone: false,
    position: 0,
    completedAt: null,
    attributes: {},
    createdAt: 1,
    updatedAt: 1,
  };

  beforeEach(() => {
    vi.mocked(q.fetchWorkspaceBundle).mockResolvedValue({
      members: [{ id: "m1", name: "Me" }],
      categories: [],
      collections: [],
      boards: [],
    } as never);
    vi.mocked(q.fetchTaskStreams).mockResolvedValue([]);
  });

  it("list_tasks returns tags (omitted when empty) and filters by a normalized tag", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([
      { ...baseTask, id: "t1", title: "A", tags: ["thesis"] },
      { ...baseTask, id: "t2", title: "B", tags: [] },
    ] as never);
    const call = collectTools();
    const all = await call("list_tasks");
    expect(all.data.tasks[0].tags).toEqual(["thesis"]);
    expect(all.data.tasks[1]).not.toHaveProperty("tags");
    const only = await call("list_tasks", { tag: "  #Thesis " });
    expect(only.data.tasks.map((t: { id: string }) => t.id)).toEqual(["t1"]);
    const bad = await call("list_tasks", { tag: " # " });
    expect(bad.isError).toBe(true);
  });

  it("create_task and update_task pass tags through; update with [] clears", async () => {
    vi.mocked(m.createTask).mockResolvedValue({ id: "t1", title: "T" } as never);
    vi.mocked(m.updateTask).mockResolvedValue({ id: "t1", title: "T" } as never);
    const call = collectTools();
    await call("create_task", { title: "T", tags: ["Home", "#home"] });
    expect(vi.mocked(m.createTask).mock.calls[0][1].tags).toEqual(["Home", "#home"]);
    await call("create_task", { title: "No tags" });
    expect(vi.mocked(m.createTask).mock.calls[1][1]).not.toHaveProperty("tags");

    await call("update_task", { id: "t1", tags: [] });
    expect(vi.mocked(m.updateTask).mock.calls[0][2]).toEqual({ tags: [] });
    const none = await call("update_task", { id: "t1", title: "x" });
    expect(none.isError).toBe(false);
    expect(vi.mocked(m.updateTask).mock.calls[1][2]).not.toHaveProperty("tags");
  });

  it("get_workspace returns tags in use and saved streams (id and name only)", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([
      { ...baseTask, id: "t1", title: "A", tags: ["b", "a"] },
      { ...baseTask, id: "t2", title: "B", tags: ["b"] },
    ] as never);
    vi.mocked(q.fetchTaskStreams).mockResolvedValue([
      { id: "s1", name: "Work", memberId: "m1", definition: {} },
    ] as never);
    const call = collectTools();
    const res = await call("get_workspace");
    expect(res.data.tags).toEqual(["b", "a"]);
    expect(res.data.streams).toEqual([{ id: "s1", name: "Work" }]);
  });

  it("get_flows groups by tag by default and never returns descriptions", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([
      { ...baseTask, id: "t1", title: "A", tags: ["x"], priority: 3, dueDate: "2020-01-01" },
      { ...baseTask, id: "t2", title: "B", tags: ["x", "y"] },
    ] as never);
    const call = collectTools();
    const res = await call("get_flows", { date: "2026-07-10" });
    expect(res.isError).toBe(false);
    expect(res.data).toMatchObject({ date: "2026-07-10", groupBy: "tag", attention: "combined" });
    expect(res.data.stream).toBeUndefined();
    expect(res.data.streams.map((s: { label: string }) => s.label)).toEqual(["x", "y"]);
    expect(res.data.streams[0].tasks[0]).toMatchObject({ id: "t1", score: 1, overdue: true });
    expect(JSON.stringify(res.data)).not.toContain("PRIVATE NOTE");
    expect(q.fetchTaskStreams).not.toHaveBeenCalled();
  });

  it("get_flows honours mine, limit and attention", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([
      { ...baseTask, id: "t1", title: "Mine", tags: ["x"], priority: 3 },
      { ...baseTask, id: "t2", title: "Theirs", ownerId: "m2", tags: ["x"], priority: 3 },
      { ...baseTask, id: "t3", title: "Mine too", tags: ["x"], priority: 1 },
    ] as never);
    const call = collectTools();
    const res = await call("get_flows", {
      date: "2026-07-10",
      mine: true,
      limit: 1,
      attention: "priority",
    });
    expect(res.data.attention).toBe("priority");
    expect(res.data.streams[0].open).toBe(2);
    expect(res.data.streams[0].tasks.map((t: { id: string }) => t.id)).toEqual(["t1"]);
  });

  it("get_flows applies a saved stream (by name, case-insensitive; by id) and rejects an unknown one", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([
      { ...baseTask, id: "t1", title: "Hi", tags: ["x"], priority: 3 },
      { ...baseTask, id: "t2", title: "Lo", tags: ["x"], priority: 1 },
    ] as never);
    vi.mocked(q.fetchTaskStreams).mockResolvedValue([
      {
        id: "s1",
        name: "Urgent Work",
        memberId: "m1",
        definition: {
          filter: {
            boardIds: null,
            categoryIds: null,
            priorities: [3],
            tags: null,
            assigneeIds: null,
            done: "all",
            milestone: "all",
            privacy: "all",
          },
          groupBy: "priority",
          sortBy: "manual",
          sortDir: "asc",
          mode: "streams",
          attention: "priority",
          scope: "all",
        },
      },
    ] as never);
    const call = collectTools();
    const byName = await call("get_flows", { date: "2026-07-10", stream: " urgent work " });
    expect(byName.data.stream).toBe("Urgent Work");
    expect(byName.data.groupBy).toBe("priority");
    expect(byName.data.attention).toBe("priority");
    expect(byName.data.streams.map((s: { label: string }) => s.label)).toEqual(["High"]);

    const byId = await call("get_flows", { date: "2026-07-10", stream: "s1", groupBy: "tag" });
    expect(byId.data.groupBy).toBe("tag");
    expect(byId.data.streams.map((s: { label: string }) => s.label)).toEqual(["x"]);
    expect(byId.data.streams[0].open).toBe(1); // the saved filter still applies

    const missing = await call("get_flows", { date: "2026-07-10", stream: "nope" });
    expect(missing.isError).toBe(true);
    expect(missing.data).not.toContain("Urgent Work");
  });
});

describe("task editing tools (the Flows app's writes)", () => {
  const row = (over: Record<string, unknown>) =>
    ({
      id: "t1",
      workspaceId: "w1",
      ownerId: "m1",
      assigneeId: null,
      parentId: null,
      collectionId: null,
      categoryId: null,
      title: "Task",
      description: "PRIVATE NOTE",
      isPrivate: false,
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
      createdAt: 1,
      updatedAt: 1,
      ...over,
    }) as never;

  it("get_task returns the task with its subtasks and no description", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([
      row({ id: "p", title: "Parent", tags: ["x"], startDate: "2026-11-01" }),
      row({ id: "c", title: "Child", parentId: "p" }),
    ]);
    const call = collectTools();
    const res = await call("get_task", { id: "p" });
    expect(res.isError).toBe(false);
    expect(res.data).toMatchObject({ id: "p", startDate: "2026-11-01", tags: ["x"] });
    expect(res.data.subtasks).toEqual([
      { id: "c", title: "Child", done: false, depth: 1, sequential: false, blocked: false },
    ]);
    expect(res.data).toMatchObject({ sequential: false, blockedBy: [], blocks: [] });
    expect(JSON.stringify(res.data)).not.toContain("PRIVATE");
    expect((await call("get_task", { id: "missing" })).isError).toBe(true);
  });

  it("a subtask is created in its parent's collection, with its privacy", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([row({ id: "p", collectionId: "col-1", isPrivate: true })]);
    vi.mocked(q.fetchWorkspaceBundle).mockResolvedValue({
      members: [],
      categories: [],
      collections: [],
      boards: [{ id: "b1-todo", collectionId: "col-1", position: 0, isDone: false }],
    } as never);
    vi.mocked(m.createTask).mockResolvedValue({ id: "new", title: "Sub" } as never);
    const call = collectTools();
    await call("create_task", { title: "Sub", parentId: "p" });
    expect(vi.mocked(m.createTask).mock.calls[0][1]).toMatchObject({
      parentId: "p",
      collectionId: "col-1",
      boardId: "b1-todo",
      isPrivate: true,
    });
  });

  it("a subtask of a task you cannot see is refused before anything is written", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([]);
    const call = collectTools();
    const res = await call("create_task", { title: "Sub", parentId: "hidden" });
    expect(res.isError).toBe(true);
    expect(m.createTask).not.toHaveBeenCalled();
  });

  it("a top-level create does not look anything up, and passes the start date", async () => {
    vi.mocked(m.createTask).mockResolvedValue({ id: "new", title: "Top" } as never);
    const call = collectTools();
    await call("create_task", { title: "Top", startDate: "2026-11-12" });
    expect(q.fetchTasks).not.toHaveBeenCalled();
    const input = vi.mocked(m.createTask).mock.calls[0][1];
    expect(input).toMatchObject({ startDate: "2026-11-12", collectionId: null });
    expect(input).not.toHaveProperty("isPrivate");
  });

  it("update_task sets and clears the start date", async () => {
    vi.mocked(m.updateTask).mockResolvedValue({ id: "t1", title: "Task" } as never);
    const call = collectTools();
    await call("update_task", { id: "t1", startDate: "2026-11-12" });
    await call("update_task", { id: "t1", startDate: null });
    expect(vi.mocked(m.updateTask).mock.calls.map((c) => c[2])).toEqual([
      { startDate: "2026-11-12" },
      { startDate: null },
    ]);
  });

  const bundle = {
    members: [{ id: "m1", name: "Me" }],
    categories: [],
    collections: [
      { id: "col-1", name: "Personal" },
      { id: "col-2", name: "Work" },
    ],
    boards: [
      { id: "b1-done", collectionId: "col-1", position: 2, isDone: true },
      { id: "b1-todo", collectionId: "col-1", position: 0, isDone: false },
      { id: "b2-doing", collectionId: "col-2", position: 1, isDone: false },
      { id: "b2-todo", collectionId: "col-2", position: 0, isDone: false },
      { id: "b2-done", collectionId: "col-2", position: 2, isDone: true },
    ],
  } as never;

  it("a task created in a collection lands in its first open column", async () => {
    vi.mocked(q.fetchWorkspaceBundle).mockResolvedValue(bundle);
    vi.mocked(m.createTask).mockResolvedValue({ id: "new", title: "T" } as never);
    const call = collectTools();
    await call("create_task", { title: "T", collectionId: "col-2" });
    expect(vi.mocked(m.createTask).mock.calls[0][1]).toMatchObject({ collectionId: "col-2", boardId: "b2-todo" });
    const hidden = await call("create_task", { title: "T", collectionId: "col-x" });
    expect(hidden.isError).toBe(true);
    expect(m.createTask).toHaveBeenCalledTimes(1);
  });

  it("moving a task moves its whole subtree, parents first, each into a fitting column", async () => {
    vi.mocked(q.fetchWorkspaceBundle).mockResolvedValue(bundle);
    vi.mocked(q.fetchTasks).mockResolvedValue([
      row({ id: "kid2", parentId: "p", collectionId: "col-1", position: 2 }),
      row({ id: "p", title: "Parent", collectionId: "col-1", boardId: "b1-todo" }),
      row({ id: "kid1", parentId: "p", collectionId: "col-1", position: 1, completedAt: 5 }),
      row({ id: "grand", parentId: "kid1", collectionId: "col-1" }),
      row({ id: "other", collectionId: "col-1" }),
    ]);
    vi.mocked(m.updateTask).mockImplementation(async (_sb, id) => ({ id, title: "Renamed" }) as never);
    const call = collectTools();
    const res = await call("update_task", { id: "p", title: "Renamed", collectionId: "col-2" });
    expect(res.data).toEqual({ id: "p", title: "Renamed", moved: 4 });
    expect(vi.mocked(m.updateTask).mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ["p", { title: "Renamed", collectionId: "col-2", boardId: "b2-todo" }],
      ["kid1", { collectionId: "col-2", boardId: "b2-done" }],
      ["grand", { collectionId: "col-2", boardId: "b2-todo" }],
      ["kid2", { collectionId: "col-2", boardId: "b2-todo" }],
    ]);
  });

  it("moving out of every collection clears the column", async () => {
    vi.mocked(q.fetchWorkspaceBundle).mockResolvedValue(bundle);
    vi.mocked(q.fetchTasks).mockResolvedValue([row({ id: "p", collectionId: "col-1", boardId: "b1-todo" })]);
    vi.mocked(m.updateTask).mockResolvedValue({ id: "p", title: "Task" } as never);
    const call = collectTools();
    await call("update_task", { id: "p", collectionId: null });
    expect(vi.mocked(m.updateTask).mock.calls[0][2]).toEqual({ collectionId: null, boardId: null });
  });

  it("refuses a move to a collection you cannot see, a subtask's move, and writes nothing", async () => {
    vi.mocked(q.fetchWorkspaceBundle).mockResolvedValue(bundle);
    vi.mocked(q.fetchTasks).mockResolvedValue([
      row({ id: "p", collectionId: "col-1" }),
      row({ id: "kid", parentId: "p", collectionId: "col-1" }),
    ]);
    const call = collectTools();
    expect((await call("update_task", { id: "p", collectionId: "col-x" })).isError).toBe(true);
    expect((await call("update_task", { id: "kid", collectionId: "col-2" })).isError).toBe(true);
    expect((await call("update_task", { id: "gone", collectionId: "col-2" })).isError).toBe(true);
    expect(m.updateTask).not.toHaveBeenCalled();
  });

  it("naming the collection a task is already in is not a move", async () => {
    vi.mocked(q.fetchWorkspaceBundle).mockResolvedValue(bundle);
    vi.mocked(q.fetchTasks).mockResolvedValue([row({ id: "p", collectionId: "col-1", boardId: "b1-done" })]);
    vi.mocked(m.updateTask).mockResolvedValue({ id: "p", title: "New" } as never);
    const call = collectTools();
    expect((await call("update_task", { id: "p", collectionId: "col-1" })).data).toMatchObject({ moved: 0 });
    expect(m.updateTask).not.toHaveBeenCalled();
    await call("update_task", { id: "p", collectionId: "col-1", title: "New" });
    expect(vi.mocked(m.updateTask).mock.calls[0][2]).toEqual({ title: "New" });
  });

  const edge = (taskId: string, dependsOnTaskId: string) => ({
    id: `d-${taskId}-${dependsOnTaskId}`,
    workspaceId: "w1",
    taskId,
    dependsOnTaskId,
    createdAt: 1,
  });

  it("list_tasks returns position and blockedBy (omitted when empty)", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([
      row({ id: "a", position: 3 }),
      row({ id: "b", position: 1 }),
      row({ id: "c", position: 2 }),
    ]);
    vi.mocked(q.fetchTaskDependencies).mockResolvedValueOnce([edge("a", "b"), edge("a", "c")]);
    const call = collectTools();
    const res = await call("list_tasks");
    expect(res.data.tasks[0]).toMatchObject({ id: "a", position: 3, blockedBy: ["b", "c"] });
    expect(res.data.tasks[1]).toMatchObject({ id: "b", position: 1 });
    expect(res.data.tasks[1]).not.toHaveProperty("blockedBy");
  });

  it("update_task blockedBy replaces the set: adds what's missing, removes the extra", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([
      row({ id: "t", title: "Task" }),
      row({ id: "keep" }),
      row({ id: "drop" }),
      row({ id: "new" }),
    ]);
    vi.mocked(q.fetchTaskDependencies).mockResolvedValueOnce([edge("t", "keep"), edge("t", "drop")]);
    vi.mocked(m.addDependency).mockImplementation(async (_sb, input) => ({ id: "d-new", createdAt: 1, ...input }));
    const call = collectTools();
    const res = await call("update_task", { id: "t", blockedBy: ["keep", "new", "new"] });
    expect(res.isError).toBe(false);
    expect(res.data).toEqual({ id: "t", title: "Task", blockedBy: ["keep", "new"] });
    expect(vi.mocked(m.addDependency).mock.calls.map((c) => c[1])).toEqual([
      { workspaceId: "w1", taskId: "t", dependsOnTaskId: "new" },
    ]);
    expect(vi.mocked(m.removeDependency).mock.calls.map((c) => c[1])).toEqual(["d-t-drop"]);
    expect(m.updateTask).not.toHaveBeenCalled(); // nothing else asked

    // [] clears it, alongside an ordinary field.
    vi.clearAllMocks();
    vi.mocked(q.fetchTaskDependencies).mockResolvedValueOnce([edge("t", "keep")]);
    vi.mocked(m.updateTask).mockResolvedValue({ id: "t", title: "Renamed" } as never);
    const cleared = await call("update_task", { id: "t", title: "Renamed", blockedBy: [] });
    expect(cleared.data).toEqual({ id: "t", title: "Renamed", blockedBy: [] });
    expect(vi.mocked(m.removeDependency).mock.calls.map((c) => c[1])).toEqual(["d-t-keep"]);
    expect(m.addDependency).not.toHaveBeenCalled();
  });

  it("update_task refuses a loop, itself, an unseen task and a task you don't own, writing nothing", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([
      row({ id: "a", title: "Write" }),
      row({ id: "b", title: "Review" }),
      row({ id: "c", title: "Publish" }),
      row({ id: "theirs", ownerId: "m2" }),
    ]);
    // c waits for b, b waits for a: a waiting for c closes the loop.
    vi.mocked(q.fetchTaskDependencies).mockResolvedValue([edge("c", "b"), edge("b", "a")]);
    const call = collectTools();

    const loop = await call("update_task", { id: "a", blockedBy: ["c"] });
    expect(loop.isError).toBe(true);
    expect(loop.data).toBe(
      'That would make a dependency loop: "Write" waits for "Publish" waits for "Review" waits for "Write". ' +
        "Remove one of those links first.",
    );
    expect((await call("update_task", { id: "a", blockedBy: ["a"] })).data).toMatch(/itself/);
    expect((await call("update_task", { id: "a", blockedBy: ["ghost"] })).data).toMatch(/No task with id ghost/);
    expect((await call("update_task", { id: "theirs", blockedBy: ["a"] })).data).toMatch(/owner/);
    expect((await call("update_task", { id: "gone", blockedBy: [] })).isError).toBe(true);
    expect((await call("update_task", { id: "a", title: "x", blockedBy: ["c"] })).isError).toBe(true);
    expect(m.addDependency).not.toHaveBeenCalled();
    expect(m.removeDependency).not.toHaveBeenCalled();
    expect(m.updateTask).not.toHaveBeenCalled();
  });

  it("update_task turns the database's loop guard into a clear error and undoes its partial adds", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([row({ id: "a" }), row({ id: "b" }), row({ id: "c" })]);
    vi.mocked(q.fetchTaskDependencies).mockResolvedValueOnce([edge("a", "old")]);
    vi.mocked(m.addDependency)
      .mockResolvedValueOnce({ id: "d-added", workspaceId: "w1", taskId: "a", dependsOnTaskId: "b", createdAt: 1 })
      .mockRejectedValueOnce(new Error("That dependency would create a cycle"));
    const call = collectTools();
    const res = await call("update_task", { id: "a", blockedBy: ["b", "c"] });
    expect(res.isError).toBe(true);
    expect(res.data).toMatch(/^That would make a dependency loop: /);
    // The add that went through is taken back; the old edge stays.
    expect(vi.mocked(m.removeDependency).mock.calls.map((c) => c[1])).toEqual(["d-added"]);
  });

  it("update_task writes blockers before fields, so a loop the database refuses saves nothing", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([row({ id: "a", title: "Write" }), row({ id: "b" })]);
    vi.mocked(q.fetchTaskDependencies).mockResolvedValue([]);
    vi.mocked(m.addDependency).mockRejectedValueOnce(new Error("That dependency would create a cycle"));
    const call = collectTools();
    const res = await call("update_task", { id: "a", title: "Write it", dueDate: "2026-11-20", blockedBy: ["b"] });
    expect(res.isError).toBe(true);
    expect(res.data).toMatch(/^That would make a dependency loop: /);
    // The fields were never written: the error is the whole truth.
    expect(m.updateTask).not.toHaveBeenCalled();

    // Accepted: the blockers go first, then the fields.
    vi.clearAllMocks();
    const order: string[] = [];
    vi.mocked(q.fetchTasks).mockResolvedValue([row({ id: "a", title: "Write" }), row({ id: "b" })]);
    vi.mocked(q.fetchTaskDependencies).mockResolvedValue([]);
    vi.mocked(m.addDependency).mockImplementation(async (_sb, input) => {
      order.push("dependency");
      return { id: "d", createdAt: 1, ...input };
    });
    vi.mocked(m.updateTask).mockImplementation(async (_sb, id) => {
      order.push("fields");
      return { id, title: "Write it" } as never;
    });
    const saved = await call("update_task", { id: "a", title: "Write it", blockedBy: ["b"] });
    expect(saved.data).toEqual({ id: "a", title: "Write it", blockedBy: ["b"] });
    expect(order).toEqual(["dependency", "fields"]);
  });

  it("create_task adds its blockers after creating, and checks them first", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([row({ id: "b1" }), row({ id: "b2" })]);
    vi.mocked(m.createTask).mockResolvedValue(row({ id: "new", title: "New" }));
    vi.mocked(m.addDependency).mockImplementation(async (_sb, input) => ({ id: "d", createdAt: 1, ...input }));
    const call = collectTools();
    const res = await call("create_task", { title: "New", blockedBy: ["b1", "b2"] });
    expect(res.data).toEqual({ id: "new", title: "New", blockedBy: ["b1", "b2"] });
    expect(vi.mocked(m.addDependency).mock.calls.map((c) => c[1].dependsOnTaskId)).toEqual(["b1", "b2"]);

    vi.clearAllMocks();
    const hidden = await call("create_task", { title: "New", blockedBy: ["b1", "ghost"] });
    expect(hidden.data).toBe("No task with id ghost is visible to you.");
    expect(m.createTask).not.toHaveBeenCalled();
    expect(m.addDependency).not.toHaveBeenCalled();
  });

  it("get_task lists blockedBy and blocks", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([
      row({ id: "t", title: "Task" }),
      row({ id: "up", title: "Up", completedAt: 5 }),
      row({ id: "down", title: "Down" }),
    ]);
    vi.mocked(q.fetchTaskDependencies).mockResolvedValueOnce([edge("t", "up"), edge("down", "t")]);
    const call = collectTools();
    const res = await call("get_task", { id: "t" });
    expect(res.data.blockedBy).toEqual([{ id: "up", title: "Up", done: true }]);
    expect(res.data.blocks).toEqual([{ id: "down", title: "Down", done: false }]);
  });

  it("list_tasks with mine keeps only the tasks the caller created", async () => {
    vi.mocked(q.fetchTasks).mockResolvedValue([
      row({ id: "own", ownerId: "m1" }),
      row({ id: "partners", ownerId: "m2", assigneeId: "m1" }),
    ]);
    const call = collectTools();
    expect((await call("list_tasks", { mine: true })).data.tasks.map((t: { id: string }) => t.id)).toEqual(["own"]);
    expect((await call("list_tasks", {})).data.count).toBe(2);
  });
});
