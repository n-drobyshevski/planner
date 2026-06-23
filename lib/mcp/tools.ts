import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { mcpContext } from "./auth";
import {
  fetchWorkspaceBundle,
  fetchWindow,
  fetchTasks,
  fetchSleepLogs,
} from "@/lib/supabase/queries";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  createTask,
  updateTask,
  deleteTask,
  StaleWriteError,
} from "@/lib/supabase/mutations";
import { expandEvents } from "@/lib/recurrence/expand";
import type { EventInput, TaskInput } from "@/lib/supabase/mappers";

// --- helpers ---------------------------------------------------------------

const toMs = (iso: string): number => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid date/time: ${iso}`);
  return ms;
};
const toIso = (ms: number): string => new Date(ms).toISOString();

/** Wrap data as a compact text tool result (no outputSchema → text content). */
function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

/** Tool error result (isError so the client/model sees it as a failure). */
function fail(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Map a thrown error to a legible tool failure, keeping write-safety semantics. */
function errorResult(err: unknown): CallToolResult {
  if (err instanceof StaleWriteError) {
    return fail(
      "Conflict: this item was changed elsewhere since you last read it. " +
        "Re-read it (list_* tool) and retry.",
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return fail(`Error: ${message}`);
}

/** Run a tool body, funnelling any throw into a clean error result. */
async function guard(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    return errorResult(err);
  }
}

// --- registration ----------------------------------------------------------

/**
 * Register the planner's MCP tools. Every handler rebuilds a member-scoped
 * Supabase client from the verified bearer token (so RLS enforces visibility and
 * write rights) and delegates to the app's existing query/mutation layer.
 *
 * Results are kept compact (ids + key fields, ISO times) to spare the model's
 * context. Destructive tools (`delete_*`) require an explicit `confirm: true`;
 * called without it they return a preview of what would be removed.
 */
export function registerTools(server: McpServer): void {
  // -- context ------------------------------------------------------------
  server.registerTool(
    "get_workspace",
    {
      title: "Get workspace",
      description:
        "List the workspace's members, categories, collections and boards, with " +
        "their ids. Call this first — other tools take these ids (categoryId, " +
        "collectionId, boardId, ownerId).",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (_args, extra) =>
      guard(async () => {
        const { sb, memberId, workspaceId } = mcpContext(extra);
        const b = await fetchWorkspaceBundle(sb);
        return ok({
          workspaceId,
          you: memberId,
          members: b.members.map((m) => ({ id: m.id, name: m.name })),
          categories: b.categories.map((c) => ({
            id: c.id,
            name: c.name,
            shared: c.ownerId == null,
          })),
          collections: b.collections.map((c) => ({ id: c.id, name: c.name })),
          boards: b.boards.map((bd) => ({
            id: bd.id,
            name: bd.name,
            collectionId: bd.collectionId,
            done: bd.isDone,
          })),
        });
      }),
  );

  // -- calendar: read -----------------------------------------------------
  server.registerTool(
    "list_events",
    {
      title: "List calendar events",
      description:
        "List calendar event occurrences between `start` and `end` (ISO 8601). " +
        "Recurring series are expanded to individual occurrences. Defaults to the " +
        "next 7 days. Returns shared + your visible events (RLS-scoped).",
      inputSchema: {
        start: z
          .string()
          .optional()
          .describe("Window start, ISO 8601. Default: now."),
        end: z
          .string()
          .optional()
          .describe("Window end, ISO 8601. Default: 7 days from start."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, extra) =>
      guard(async () => {
        const { sb, workspaceId } = mcpContext(extra);
        const start = args.start ? toMs(args.start) : Date.now();
        const end = args.end ? toMs(args.end) : start + 7 * 24 * 60 * 60 * 1000;
        if (end <= start) return fail("`end` must be after `start`.");
        const { events, overrides } = await fetchWindow(sb, workspaceId, {
          start,
          end,
        });
        const occurrences = expandEvents(events, overrides, { start, end });
        return ok({
          window: { start: toIso(start), end: toIso(end) },
          count: occurrences.length,
          events: occurrences.map((o) => ({
            id: o.eventId,
            title: o.title,
            start: toIso(o.start),
            end: toIso(o.end),
            allDay: o.allDay,
            location: o.location ?? undefined,
            categoryId: o.categoryId ?? undefined,
            recurring: o.isRecurring,
          })),
        });
      }),
  );

  // -- calendar: write ----------------------------------------------------
  server.registerTool(
    "create_event",
    {
      title: "Create calendar event",
      description:
        "Create a calendar event you own. Times are ISO 8601. For a recurring " +
        "event pass an RFC 5545 `rrule` (e.g. 'FREQ=WEEKLY;BYDAY=TU'). Returns the " +
        "new event id.",
      inputSchema: {
        title: z.string().min(1).max(500),
        start: z.string().describe("Start, ISO 8601."),
        end: z.string().describe("End, ISO 8601."),
        timeZone: z
          .string()
          .optional()
          .describe("IANA time zone (e.g. 'Europe/Berlin'). Default: UTC."),
        allDay: z.boolean().optional(),
        description: z.string().max(5000).optional(),
        location: z.string().max(1000).optional(),
        categoryId: z.string().optional().describe("From get_workspace."),
        rrule: z.string().optional().describe("RFC 5545 RRULE for recurrence."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args, extra) =>
      guard(async () => {
        const { sb, memberId, workspaceId } = mcpContext(extra);
        const start = toMs(args.start);
        const end = toMs(args.end);
        if (end < start) return fail("`end` must be at or after `start`.");
        const input: EventInput = {
          workspaceId,
          ownerId: memberId,
          title: args.title,
          start,
          end,
          timeZone: args.timeZone ?? "UTC",
          allDay: args.allDay ?? false,
          description: args.description ?? null,
          location: args.location ?? null,
          categoryId: args.categoryId ?? null,
          rrule: args.rrule ?? null,
        };
        const row = await createEvent(sb, input);
        return ok({ id: row.id, title: row.title, start: toIso(row.start) });
      }),
  );

  server.registerTool(
    "update_event",
    {
      title: "Update calendar event",
      description:
        "Update fields of an event by id. Only provided fields change. Times are " +
        "ISO 8601. Edits apply to the whole series for recurring events.",
      inputSchema: {
        id: z.string(),
        title: z.string().min(1).max(500).optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        allDay: z.boolean().optional(),
        description: z.string().max(5000).nullable().optional(),
        location: z.string().max(1000).nullable().optional(),
        categoryId: z.string().nullable().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args, extra) =>
      guard(async () => {
        const { sb } = mcpContext(extra);
        const patch: Partial<EventInput> = {};
        if (args.title !== undefined) patch.title = args.title;
        if (args.start !== undefined) patch.start = toMs(args.start);
        if (args.end !== undefined) patch.end = toMs(args.end);
        if (args.allDay !== undefined) patch.allDay = args.allDay;
        if (args.description !== undefined) patch.description = args.description;
        if (args.location !== undefined) patch.location = args.location;
        if (args.categoryId !== undefined) patch.categoryId = args.categoryId;
        if (Object.keys(patch).length === 0)
          return fail("Provide at least one field to update.");
        const row = await updateEvent(sb, args.id, patch);
        return ok({ id: row.id, title: row.title, start: toIso(row.start) });
      }),
  );

  server.registerTool(
    "delete_event",
    {
      title: "Delete calendar event",
      description:
        "Delete an event by id (the whole series, if recurring). Destructive: " +
        "call with `confirm: true` to actually delete; without it you get a preview.",
      inputSchema: {
        id: z.string(),
        confirm: z
          .boolean()
          .optional()
          .describe("Must be true to perform the deletion."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    (args, extra) =>
      guard(async () => {
        const { sb, workspaceId } = mcpContext(extra);
        // Preview from the master rows so we can name what will be removed.
        const { events } = await fetchWindow(sb, workspaceId, {
          start: -8.64e15,
          end: 8.64e15,
        });
        const target = events.find((e) => e.id === args.id);
        if (!target) return fail(`No event with id ${args.id} is visible to you.`);
        if (args.confirm !== true) {
          return ok({
            preview: true,
            wouldDelete: {
              id: target.id,
              title: target.title,
              start: toIso(target.start),
              recurring: target.rrule != null,
            },
            note: "Re-call delete_event with confirm: true to delete this.",
          });
        }
        await deleteEvent(sb, args.id);
        return ok({ deleted: true, id: args.id });
      }),
  );

  // -- tasks: read --------------------------------------------------------
  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description:
        "List tasks (RLS-scoped). Optionally filter by collectionId, boardId, or " +
        "completion. Returns compact rows; use get_workspace to resolve board names.",
      inputSchema: {
        collectionId: z.string().optional(),
        boardId: z.string().optional(),
        includeCompleted: z
          .boolean()
          .optional()
          .describe("Include done tasks. Default: true."),
        includeSubtasks: z
          .boolean()
          .optional()
          .describe("Include subtasks (parentId set). Default: true."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, extra) =>
      guard(async () => {
        const { sb, workspaceId } = mcpContext(extra);
        let tasks = await fetchTasks(sb, workspaceId);
        if (args.collectionId)
          tasks = tasks.filter((t) => t.collectionId === args.collectionId);
        if (args.boardId) tasks = tasks.filter((t) => t.boardId === args.boardId);
        if (args.includeCompleted === false)
          tasks = tasks.filter((t) => t.completedAt == null);
        if (args.includeSubtasks === false)
          tasks = tasks.filter((t) => t.parentId == null);
        return ok({
          count: tasks.length,
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            done: t.completedAt != null,
            boardId: t.boardId ?? undefined,
            collectionId: t.collectionId ?? undefined,
            parentId: t.parentId ?? undefined,
            priority: t.priority ?? undefined,
            dueDate: t.dueDate ?? undefined,
          })),
        });
      }),
  );

  // -- tasks: write -------------------------------------------------------
  server.registerTool(
    "create_task",
    {
      title: "Create task",
      description:
        "Create a task you own. Optionally place it in a collection/board and set " +
        "a due date (yyyy-MM-dd), priority (0-3), or parent (for a subtask).",
      inputSchema: {
        title: z.string().min(1).max(500),
        description: z.string().max(5000).optional(),
        collectionId: z.string().optional(),
        boardId: z.string().optional(),
        parentId: z.string().optional().describe("Make this a subtask of this id."),
        categoryId: z.string().optional(),
        priority: z.number().int().min(0).max(3).optional(),
        dueDate: z.string().optional().describe("Calendar date, yyyy-MM-dd."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args, extra) =>
      guard(async () => {
        const { sb, memberId, workspaceId } = mcpContext(extra);
        const input: TaskInput = {
          workspaceId,
          ownerId: memberId,
          title: args.title,
          description: args.description ?? null,
          collectionId: args.collectionId ?? null,
          boardId: args.boardId ?? null,
          parentId: args.parentId ?? null,
          categoryId: args.categoryId ?? null,
          priority: args.priority ?? null,
          dueDate: args.dueDate ?? null,
        };
        const row = await createTask(sb, input);
        return ok({ id: row.id, title: row.title });
      }),
  );

  server.registerTool(
    "update_task",
    {
      title: "Update task",
      description:
        "Update fields of a task by id. Only provided fields change. To complete " +
        "a task prefer complete_task (it also moves it to the done board).",
      inputSchema: {
        id: z.string(),
        title: z.string().min(1).max(500).optional(),
        description: z.string().max(5000).nullable().optional(),
        boardId: z.string().nullable().optional(),
        priority: z.number().int().min(0).max(3).nullable().optional(),
        dueDate: z.string().nullable().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args, extra) =>
      guard(async () => {
        const { sb } = mcpContext(extra);
        const patch: Partial<TaskInput> = {};
        if (args.title !== undefined) patch.title = args.title;
        if (args.description !== undefined) patch.description = args.description;
        if (args.boardId !== undefined) patch.boardId = args.boardId;
        if (args.priority !== undefined) patch.priority = args.priority;
        if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
        if (Object.keys(patch).length === 0)
          return fail("Provide at least one field to update.");
        const row = await updateTask(sb, args.id, patch);
        return ok({ id: row.id, title: row.title });
      }),
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete task",
      description:
        "Mark a task done (or reopen it with done:false). Mirrors the app: a done " +
        "task moves to its collection's done board and records completion time.",
      inputSchema: {
        id: z.string(),
        done: z.boolean().optional().describe("true = complete (default), false = reopen."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args, extra) =>
      guard(async () => {
        const { sb, workspaceId } = mcpContext(extra);
        const done = args.done !== false;
        const tasks = await fetchTasks(sb, workspaceId);
        const task = tasks.find((t) => t.id === args.id);
        if (!task) return fail(`No task with id ${args.id} is visible to you.`);
        const bundle = await fetchWorkspaceBundle(sb);
        const cols = bundle.boards.filter((b) => b.collectionId === task.collectionId);
        // Done → first done board; reopen → first non-done board (mirrors the app).
        const target = done
          ? cols.find((b) => b.isDone)
          : cols.find((b) => !b.isDone);
        const patch: Partial<TaskInput> = {
          completedAt: done ? Date.now() : null,
        };
        if (target && target.id !== task.boardId) patch.boardId = target.id;
        const row = await updateTask(sb, args.id, patch);
        return ok({ id: row.id, title: row.title, done });
      }),
  );

  server.registerTool(
    "delete_task",
    {
      title: "Delete task",
      description:
        "Delete a task by id (and its subtasks, by cascade). Destructive: call " +
        "with `confirm: true` to delete; without it you get a preview.",
      inputSchema: {
        id: z.string(),
        confirm: z.boolean().optional().describe("Must be true to perform the deletion."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    (args, extra) =>
      guard(async () => {
        const { sb, workspaceId } = mcpContext(extra);
        const tasks = await fetchTasks(sb, workspaceId);
        const target = tasks.find((t) => t.id === args.id);
        if (!target) return fail(`No task with id ${args.id} is visible to you.`);
        if (args.confirm !== true) {
          const childCount = tasks.filter((t) => t.parentId === args.id).length;
          return ok({
            preview: true,
            wouldDelete: { id: target.id, title: target.title, subtasks: childCount },
            note: "Re-call delete_task with confirm: true to delete this.",
          });
        }
        await deleteTask(sb, args.id);
        return ok({ deleted: true, id: args.id });
      }),
  );

  // -- insights -----------------------------------------------------------
  server.registerTool(
    "get_sleep_summary",
    {
      title: "Get sleep summary",
      description:
        "Your recent sleep nights and simple aggregates (member-private; only " +
        "ever your own data). Defaults to the last 14 logged nights.",
      inputSchema: {
        nights: z
          .number()
          .int()
          .min(1)
          .max(180)
          .optional()
          .describe("How many most-recent nights to return. Default: 14."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, extra) =>
      guard(async () => {
        const { sb, memberId, workspaceId } = mcpContext(extra);
        const limit = args.nights ?? 14;
        const all = await fetchSleepLogs(sb, workspaceId, memberId);
        const recent = all.slice(-limit);
        const durations = recent
          .filter((l) => l.bedtimeAt != null && l.wokeAt != null)
          .map((l) => (l.wokeAt! - l.bedtimeAt!) / 3_600_000);
        const avg = (xs: number[]) =>
          xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
        const qualities = recent.map((l) => l.quality).filter((q): q is number => q != null);
        return ok({
          nights: recent.length,
          avgDurationHrs: avg(durations),
          avgQuality: avg(qualities),
          logs: recent.map((l) => ({
            date: l.date,
            bedtime: l.bedtimeAt ? toIso(l.bedtimeAt) : undefined,
            woke: l.wokeAt ? toIso(l.wokeAt) : undefined,
            quality: l.quality ?? undefined,
            fatigue: l.fatigue ?? undefined,
          })),
        });
      }),
  );
}
