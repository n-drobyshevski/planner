import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/mcp/auth", () => ({
  mcpContext: () => ({ sb: {}, memberId: "m1", workspaceId: "w1" }),
}));

import { registerTools } from "@/lib/mcp/tools";
import { fetchTasks } from "@/lib/supabase/queries";
import { FLOWS_APP_URI } from "@/lib/mcp/app/register";
import { FLOWS_APP_HTML } from "@/lib/mcp/app/flows-app.generated";

interface Tool {
  config: { _meta?: Record<string, unknown>; annotations?: Record<string, unknown> };
  cb: (args: unknown, extra: unknown) => Promise<{
    content: { text: string }[];
    structuredContent?: unknown;
    isError?: boolean;
  }>;
}
interface Resource {
  uri: string;
  read: (uri: URL, extra: unknown) => Promise<{ contents: { uri: string; mimeType: string; text: string }[] }>;
}

function collect() {
  const tools = new Map<string, Tool>();
  const resources: Resource[] = [];
  registerTools({
    registerTool(name: string, config: Tool["config"], cb: Tool["cb"]) {
      tools.set(name, { config, cb });
    },
    registerResource(_name: string, uri: string, _config: unknown, read: Resource["read"]) {
      resources.push({ uri, read });
    },
  } as never);
  return { tools, resources };
}

describe("the Flows MCP App", () => {
  it("links show_flows to its view and leaves get_flows a plain tool", () => {
    const { tools } = collect();
    const meta = tools.get("show_flows")!.config._meta as { ui: { resourceUri: string } };
    expect(meta.ui.resourceUri).toBe(FLOWS_APP_URI);
    expect(tools.get("show_flows")!.config.annotations).toMatchObject({ readOnlyHint: true });
    expect(tools.get("get_flows")!.config._meta).toBeUndefined();
  });

  it("serves one self-contained document as the view", async () => {
    const { resources } = collect();
    expect(resources.map((r) => r.uri)).toEqual([FLOWS_APP_URI]);
    const { contents } = await resources[0].read(new URL(FLOWS_APP_URI), {});
    expect(contents).toHaveLength(1);
    expect(contents[0]).toMatchObject({ uri: FLOWS_APP_URI, mimeType: "text/html;profile=mcp-app" });
    const html = contents[0].text;
    expect(html).toBe(FLOWS_APP_HTML);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    // Nothing is fetched: no external script, stylesheet, image or import.
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|<img|@import/i);
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it("returns the streams as text for the model and as structured content for the view", async () => {
    const { tools } = collect();
    const result = await tools.get("show_flows")!.cb({ date: "2026-11-10" }, {});
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ date: "2026-11-10", groupBy: "tag", streams: [] });
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
  });

  it("gives the view every open task of a stream and the model only `limit`", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: `t${i}`, workspaceId: "w1", ownerId: "m1", assigneeId: null, parentId: null,
      collectionId: null, categoryId: null, description: null, isPrivate: false, color: null,
      boardId: null, priority: null, dueDate: null, startDate: null, isMilestone: false,
      position: i, sequential: false, completedAt: null, attributes: {}, tags: ["work"],
      createdAt: 1, updatedAt: 1, updatedBy: null, title: `Task ${i}`,
    }));
    vi.mocked(fetchTasks).mockResolvedValueOnce(rows as never);
    const { tools } = collect();
    const result = await tools.get("show_flows")!.cb({ date: "2026-11-10" }, {});
    const view = result.structuredContent as { streams: { open: number; tasks: unknown[] }[] };
    expect(view.streams[0]).toMatchObject({ open: 12 });
    expect(view.streams[0].tasks).toHaveLength(12);
    const text = JSON.parse(result.content[0].text) as typeof view;
    expect(text.streams[0].tasks).toHaveLength(3);
  });

  it("gives the view each task's subtasks, and keeps them out of the model's text", async () => {
    const base = {
      workspaceId: "w1", ownerId: "m1", assigneeId: null, collectionId: null, categoryId: null,
      description: null, isPrivate: false, color: null, boardId: null, priority: null, dueDate: null,
      startDate: null, isMilestone: false, sequential: false, completedAt: null, attributes: {},
      createdAt: 1, updatedAt: 1, updatedBy: null,
    };
    vi.mocked(fetchTasks).mockResolvedValueOnce([
      { ...base, id: "p", parentId: null, position: 0, tags: ["work"], title: "Parent" },
      { ...base, id: "c", parentId: "p", position: 0, tags: [], title: "Child" },
    ] as never);
    const { tools } = collect();
    const result = await tools.get("show_flows")!.cb({ date: "2026-11-10" }, {});
    const view = result.structuredContent as { streams: { tasks: { id: string; subtasks?: unknown[] }[] }[] };
    expect(view.streams[0].tasks[0].subtasks).toEqual([
      { id: "c", title: "Child", parentId: "p", depth: 1, done: false },
    ]);
    const text = JSON.parse(result.content[0].text) as typeof view;
    expect(text.streams[0].tasks[0].id).toBe("p");
    expect(text.streams[0].tasks[0]).not.toHaveProperty("subtasks");
    expect(result.content[0].text).not.toContain("Child");
  });

  it("answers an unknown saved stream with an error and no structured content", async () => {
    const { tools } = collect();
    const result = await tools.get("show_flows")!.cb({ date: "2026-11-10", stream: "nope" }, {});
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });

  it("is built from the current view source", () => {
    const script = path.resolve(__dirname, "../../scripts/build-mcp-app.mjs");
    expect(() => execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" })).not.toThrow();
  });
});
