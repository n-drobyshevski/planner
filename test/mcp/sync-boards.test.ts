import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/queries", () => ({
  fetchWorkspaceBundle: vi.fn(async () => ({ boards: [], categories: [], collections: [], members: [] })),
  fetchWindow: vi.fn(),
  fetchTasks: vi.fn(async () => []),
  fetchTaskStreams: vi.fn(async () => []),
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

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.signature-for-tests";
vi.mock("@/lib/mcp/auth", () => ({
  mcpContext: () => ({ sb: {}, memberId: "m1", workspaceId: "w1", token: TOKEN }),
}));

import { registerTools } from "@/lib/mcp/tools";
import { FLOWS_APP_URI } from "@/lib/mcp/app/register";
import { SYNC_MESSAGES } from "@/lib/mcp/echo-sync";

const URL_ = "https://echo.example.test/planner/board-sync";

interface Tool {
  config: { _meta?: Record<string, unknown>; annotations?: Record<string, unknown>; inputSchema?: unknown };
  cb: (args: unknown, extra: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>;
}

function syncTool(): Tool {
  const tools = new Map<string, Tool>();
  registerTools({
    registerTool(name: string, config: Tool["config"], cb: Tool["cb"]) {
      tools.set(name, { config, cb });
    },
    registerResource() {},
  } as never);
  return tools.get("sync_boards")!;
}

const board = (extra: Record<string, unknown> = {}) => ({
  outcome: "ok",
  cards_added: 0, cards_changed: 3, cards_tagged: 1, cards_removed: 0,
  tasks_created: 1, tasks_changed: 0, tasks_untagged: 0, paired: 0, conflicts: 0,
  skipped: 0, waiting: 0, held: 0, subs_added: 0, subs_changed: 0, subs_removed: 0,
  subs_created: 0, subs_detached: 0, deps_changed: 0, subs_paired: 0,
  ...extra,
});

function respond(status: number, body?: unknown) {
  const fetchMock = vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("sync_boards", () => {
  beforeEach(() => {
    vi.stubEnv("ECHO_BOARD_SYNC_URL", URL_);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is an app-only tool of the Flows view, not offered to the model", () => {
    const tool = syncTool();
    expect(tool.config._meta).toMatchObject({ ui: { resourceUri: FLOWS_APP_URI, visibility: ["app"] } });
    expect(tool.config.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true });
  });

  it("posts to Echo with the member's own token as the bearer", async () => {
    const fetchMock = respond(200, { status: "done", outcome: "ok", boards: [board()] });
    const result = await syncTool().cb({}, {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toEqual({ status: "done", outcome: "ok", boards: [board()] });
  });

  it("passes counts on and drops anything else Echo might add", async () => {
    respond(200, { status: "done", outcome: "ok", boards: [{ ...board(), name: "Work tasks.md", cards_added: -2 }] });
    const result = await syncTool().cb({}, {});
    const out = JSON.parse(result.content[0].text);
    expect(out.boards[0]).not.toHaveProperty("name");
    expect(out.boards[0].cards_added).toBe(0);
    expect(result.content[0].text).not.toContain("Work tasks");
  });

  it("maps 202 to queued and already_queued through", async () => {
    respond(202, { status: "queued" });
    expect(JSON.parse((await syncTool().cb({}, {})).content[0].text)).toEqual({ status: "queued" });
    respond(200, { status: "already_queued" });
    expect(JSON.parse((await syncTool().cb({}, {})).content[0].text)).toEqual({ status: "already_queued" });
  });

  it.each([
    [401, SYNC_MESSAGES.rejected],
    [403, SYNC_MESSAGES.rejected],
    [404, SYNC_MESSAGES.off],
    [429, SYNC_MESSAGES.busy],
    [503, SYNC_MESSAGES.broken],
  ])("answers Echo's %i with a message for the member", async (status, message) => {
    respond(status, { error: "x" });
    const result = await syncTool().cb({}, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(message);
  });

  it("says Echo did not answer on a network error or a timeout", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    let result = await syncTool().cb({}, {});
    expect(result).toMatchObject({ isError: true, content: [{ text: SYNC_MESSAGES.noAnswer }] });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new DOMException("timed out", "TimeoutError"))));
    result = await syncTool().cb({}, {});
    expect(result.content[0].text).toBe("Echo did not answer.");
  });

  it("says it is not configured, and calls nothing, without ECHO_BOARD_SYNC_URL", async () => {
    vi.stubEnv("ECHO_BOARD_SYNC_URL", "");
    const fetchMock = respond(200, {});
    const result = await syncTool().cb({}, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(SYNC_MESSAGES.notConfigured);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never puts the token in its answer", async () => {
    respond(401, { error: "unauthorized" });
    const result = await syncTool().cb({}, {});
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});
