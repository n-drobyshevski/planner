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
    let data: unknown = undefined;
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
});
