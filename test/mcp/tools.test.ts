import { describe, it, expect, vi, beforeEach } from "vitest";

// --- mock the data layer + the auth seam ----------------------------------
vi.mock("@/lib/supabase/queries", () => ({
  fetchWorkspaceBundle: vi.fn(),
  fetchWindow: vi.fn(),
  fetchTasks: vi.fn(),
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
    vi.mocked(q.fetchWorkspaceBundle).mockResolvedValue({ boards: [] } as never);
    vi.mocked(expand.expandEvents).mockReturnValue([]);
  });

  it("windows a non-UTC local day DST-correctly (America/New_York, EDT = UTC-4)", async () => {
    const call = collectTools();
    await call("get_agenda", { date: "2026-09-23", timeZone: "America/New_York" });
    const win = vi.mocked(q.fetchWindow).mock.calls[0][2];
    expect(new Date(win.start).toISOString()).toBe("2026-09-23T04:00:00.000Z");
    expect(new Date(win.end).toISOString()).toBe("2026-09-24T04:00:00.000Z");
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
