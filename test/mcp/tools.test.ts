import { describe, it, expect, vi, beforeEach } from "vitest";

// --- mock the data layer + the auth seam ----------------------------------
vi.mock("@/lib/supabase/queries", () => ({
  fetchWorkspaceBundle: vi.fn(),
  fetchWindow: vi.fn(),
  fetchTasks: vi.fn(),
  fetchTaskStreams: vi.fn(),
  fetchSleepLogs: vi.fn(),
}));
vi.mock("@/lib/supabase/mutations", () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
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
    registerTools({ registerTool: (n: string) => names.push(n) } as never);
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
