import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { mcpContext } from "./auth";
import {
  fetchWorkspaceBundle,
  fetchWindow,
  fetchTasks,
  fetchTaskStreams,
  fetchTaskDependencies,
  fetchSleepLogs,
} from "@/lib/supabase/queries";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  createTask,
  updateTask,
  deleteTask,
  addDependency,
  removeDependency,
  StaleWriteError,
} from "@/lib/supabase/mutations";
import { expandEvents } from "@/lib/recurrence/expand";
import type { EventInput, TaskInput } from "@/lib/supabase/mappers";
import {
  dateInputToMs,
  dayStartOffset,
  dateKeyInZone,
  dateInputToUtcMs,
} from "@/lib/datetime/local";
import { projectAgenda, projectAgendaTasks, type AgendaTaskStatus } from "./projection";
import {
  projectFlows,
  resolveFlowOptions,
  MCP_FLOWS_GROUP_BYS,
  landingBoardId,
  projectTaskDetail,
  subtreeInOrder,
  type FlowsOut,
  type FlowTaskOut,
  type McpFlowsGroupBy,
} from "./flows";
import { registerFlowsApp, registerSyncBoards } from "./app/register";
import { requestBoardSync } from "./echo-sync";
import { MAX_TAGS, MAX_TAG_LENGTH, collectTags, normalizeTag } from "@/lib/tasks/tags";
import type { Board, TaskDependency, TaskRow } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// --- helpers ---------------------------------------------------------------

const toMs = (iso: string): number => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid date/time: ${iso}`);
  return ms;
};
const toIso = (ms: number): string => new Date(ms).toISOString();

/** Whether `Intl` accepts `tz` as an IANA time zone identifier. */
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const DAY_MS = 86_400_000;

/**
 * Normalize an all-day [start, end) pair to zone-independent UTC-midnight
 * calendar-date boundaries, the way `allDayDateKey` reads them back. Without
 * this, an all-day range sent as local midnight in a non-UTC zone (as a
 * machine client naturally would) is stored one day early or spanning two
 * days — see `lib/datetime/local.ts` (`dateInputToUtcMs` / `allDayDateKey`).
 *
 * A range already on UTC-midnight boundaries is taken as floating dates and
 * kept as is (Anchor sends that, and so do most clients writing `…T00:00Z`);
 * re-reading it in a zone west of UTC would shift it a day early.
 */
function allDayRange(
  start: number,
  end: number,
  timeZone: string,
): { start: number; end: number } {
  if (start % DAY_MS === 0 && end % DAY_MS === 0 && end > start) return { start, end };
  const first = dateInputToUtcMs(dateKeyInZone(start, timeZone));
  const last = dateInputToUtcMs(dateKeyInZone(end, timeZone));
  // The stored end is exclusive. A caller that gives an inclusive end on the
  // last day (09:00 to 23:59, or the same instant twice) lands both ends on
  // one date; that is a one-day event, never a zero-length one.
  return { start: first, end: last > first ? last : first + DAY_MS };
}

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

// --- dependencies (blocks / blocked-by) -----------------------------------

/** Blockers one task may list at most, per call. */
const MAX_BLOCKED_BY = 20;

const blockedBySchema = z
  .array(z.string().min(1))
  .max(MAX_BLOCKED_BY);

/**
 * A path of "waits for" edges from `from` to `to` over the visible edges, or
 * null. Breadth-first, so the loop named is the shortest one.
 */
function waitPath(from: string, to: string, deps: readonly TaskDependency[]): string[] | null {
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === to) {
      const path: string[] = [];
      for (let at: string | null = cur; at !== null; at = prev.get(at) ?? null) path.unshift(at);
      return path;
    }
    for (const d of deps) {
      if (d.taskId !== cur || prev.has(d.dependsOnTaskId)) continue;
      prev.set(d.dependsOnTaskId, cur);
      queue.push(d.dependsOnTaskId);
    }
  }
  return null;
}

const loopMessage = (titles: string[]): string =>
  `That would make a dependency loop: ${titles.map((t) => `"${t}"`).join(" waits for ")}. ` +
  "Remove one of those links first.";

interface BlockedByPlan {
  add: string[];
  remove: TaskDependency[];
  final: string[];
}

/**
 * Plan replacing `taskId`'s blockers with `wanted`: what to add and remove.
 * A string is the reason it can't be done (nothing is written then): an id
 * that is not a visible task, the task itself, or a loop through the edges the
 * caller can see (the database still guards loops through hidden ones).
 */
function planBlockedBy(
  task: TaskRow,
  wanted: readonly string[],
  tasks: readonly TaskRow[],
  deps: readonly TaskDependency[],
): BlockedByPlan | string {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const final = [...new Set(wanted.map((id) => id.trim()))];
  for (const id of final) {
    if (id === task.id) return "A task can't wait for itself.";
    if (!byId.has(id)) return `No task with id ${id} is visible to you.`;
  }
  const current = deps.filter((d) => d.taskId === task.id);
  const have = new Set(current.map((d) => d.dependsOnTaskId));
  const add = final.filter((id) => !have.has(id));
  for (const id of add) {
    // task waits for id: a loop when id already (transitively) waits for task.
    const path = waitPath(id, task.id, deps);
    if (path) return loopMessage([task.id, ...path].map((p) => byId.get(p)?.title ?? p));
  }
  return { add, remove: current.filter((d) => !final.includes(d.dependsOnTaskId)), final };
}

/** Whether a write failed on the database's loop guard (task_dep_check_acyclic). */
const isLoopError = (err: unknown): boolean =>
  err instanceof Error && /cycle/i.test(err.message);

/**
 * Apply a plan: adds first, then removals. A failed add undoes the adds made
 * so far (best effort), so the set never ends up half-replaced, and comes
 * back as a string. Returns the final blocker ids.
 */
async function applyBlockedBy(
  sb: SupabaseClient,
  workspaceId: string,
  taskId: string,
  plan: BlockedByPlan,
): Promise<string[] | string> {
  const added: TaskDependency[] = [];
  for (const dependsOnTaskId of plan.add) {
    try {
      added.push(await addDependency(sb, { workspaceId, taskId, dependsOnTaskId }));
    } catch (err) {
      for (const row of added) await removeDependency(sb, row.id).catch(() => undefined);
      if (isLoopError(err)) {
        return (
          "That would make a dependency loop: a task it would wait for already waits for it, " +
          "possibly through tasks you can't see. Remove one of those links first."
        );
      }
      throw err;
    }
  }
  for (const d of plan.remove) await removeDependency(sb, d.id);
  return plan.final;
}

/** `get_flows` / `show_flows` input: one shape, so the tool and its view agree. */
const flowsInputShape = {
    date: z
      .iso.date()
      .describe("The caller's local today, yyyy-MM-dd (deadlines are judged against it)."),
    groupBy: z
      .enum(MCP_FLOWS_GROUP_BYS)
      .optional()
      .describe("How to split tasks into streams. Default: 'tag'."),
    stream: z
      .string()
      .optional()
      .describe("A saved stream's id or name; supplies filter, groupBy and attention."),
    attention: z
      .enum(["deadline", "priority", "combined"])
      .optional()
      .describe(
        "Scoring: 'deadline', 'priority' or 'combined' (default).",
      ),
    mine: z
      .boolean()
      .optional()
      .describe("Only top-level tasks you own or are assigned to. Default: false."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe("Tasks returned per stream. Default: 3."),
};

/** A Flows task as the model reads it: the view's subtask tree and link ids left out. */
function withoutViewFields(task: FlowTaskOut): FlowTaskOut {
  const copy = { ...task };
  delete copy.subtasks;
  delete copy.blockedBy;
  return copy;
}

/** Open tasks per stream `show_flows` hands its view (not the model). */
const SHOW_FLOWS_TASKS = 50;

interface FlowsArgs {
  date: string;
  groupBy?: McpFlowsGroupBy;
  stream?: string;
  attention?: "deadline" | "priority" | "combined";
  mine?: boolean;
  limit?: number;
  /** `show_flows`' view: each task's flattened subtask tree */
  withSubtasks?: boolean;
}

/**
 * The streams for one `get_flows` / `show_flows` call, under the caller's RLS.
 * Returns a message instead when the named saved stream does not exist (it
 * lists no names: a stream is private to its member).
 */
async function loadFlows(args: FlowsArgs, extra: Parameters<typeof mcpContext>[0]): Promise<FlowsOut | string> {
  const { sb, memberId, workspaceId } = mcpContext(extra);
  let saved: Awaited<ReturnType<typeof fetchTaskStreams>>[number] | undefined;
  if (args.stream !== undefined) {
    const wanted = args.stream.trim().toLowerCase();
    const streams = await fetchTaskStreams(sb, workspaceId, memberId);
    saved =
      streams.find((s) => s.id === args.stream!.trim()) ??
      streams.find((s) => s.name.trim().toLowerCase() === wanted);
    if (!saved) {
      return "No saved stream matches that id or name. Call get_workspace to see your streams.";
    }
  }
  const opts = resolveFlowOptions(
    {
      groupBy: args.groupBy,
      attention: args.attention,
    },
    saved?.definition,
  );
  const [bundle, tasks, dependencies] = await Promise.all([
    fetchWorkspaceBundle(sb),
    fetchTasks(sb, workspaceId),
    fetchTaskDependencies(sb, workspaceId),
  ]);
  return projectFlows({
    tasks,
    dependencies,
    withSubtasks: args.withSubtasks ?? false,
    boards: bundle.boards,
    categories: bundle.categories,
    collections: bundle.collections,
    members: bundle.members,
    memberId,
    date: args.date,
    nowMs: Date.now(),
    groupBy: opts.groupBy,
    attention: opts.attention,
    filter: opts.filter,
    mine: args.mine ?? false,
    limit: args.limit ?? 3,
    streamName: saved?.name,
  });
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
        "their ids, plus every tag in use and your saved streams (id and name). " +
        "Call this first — other tools take these ids (categoryId, " +
        "collectionId, boardId, ownerId) and tag names.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (_args, extra) =>
      guard(async () => {
        const { sb, memberId, workspaceId } = mcpContext(extra);
        const [b, tasks, streams] = await Promise.all([
          fetchWorkspaceBundle(sb),
          fetchTasks(sb, workspaceId),
          fetchTaskStreams(sb, workspaceId, memberId),
        ]);
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
          tags: collectTags(tasks),
          streams: streams.map((st) => ({ id: st.id, name: st.name })),
        });
      }),
  );

  // -- agenda ---------------------------------------------------------------
  server.registerTool(
    "get_agenda",
    {
      title: "Get agenda",
      description:
        "A compact agenda for one local day (or two, with `days: 2`): your own " +
        "events plus the partner's (per `partner`), and your own open tasks due " +
        "in the window. The window is the local day(s) of `date` in `timeZone`, " +
        "DST-correct — not a UTC day. Built for a machine client (e.g. a daily " +
        "digest bot), not for browsing; use list_events/list_tasks for that.",
      inputSchema: {
        date: z.iso
          .date()
          .describe("Local calendar date, yyyy-MM-dd — the window's first day."),
        timeZone: z
          .string()
          .refine(isValidTimeZone, "Not a valid IANA time zone.")
          .describe("IANA time zone, e.g. 'Europe/Berlin'."),
        days: z
          .union([z.literal(1), z.literal(2)])
          .optional()
          .describe("Window length in local days. Default: 1."),
        partner: z
          .enum(["none", "busy", "shared"])
          .optional()
          .describe(
            "Partner visibility: 'none' (default, no partner items), 'busy' " +
              "(times only, no titles), 'shared' (the partner's non-private " +
              "titles too — never a private event, and never an id).",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, extra) =>
      guard(async () => {
        const { sb, memberId, workspaceId } = mcpContext(extra);
        const days = args.days ?? 1;
        const partnerMode = args.partner ?? "none";

        const start = dateInputToMs(args.date, args.timeZone);
        const end = dayStartOffset(start, days, args.timeZone);
        const lastDay = dateKeyInZone(end - 1, args.timeZone);

        // Fetched up front (not just for board state below) so its
        // categories give `expandEvents` the shared-category ids: without
        // them a joint event's `isShared` never comes out true and
        // `projectAgenda` can't recognize it as also the caller's own.
        const bundle = await fetchWorkspaceBundle(sb);
        const sharedCategoryIds = new Set(
          bundle.categories.filter((c) => c.ownerId === null).map((c) => c.id),
        );

        const { events: eventRows, overrides } = await fetchWindow(sb, workspaceId, {
          start,
          end,
        });
        const occurrences = expandEvents(eventRows, overrides, { start, end }, sharedCategoryIds);
        const events = projectAgenda(occurrences, memberId, partnerMode, args.date, lastDay);

        // Board state -> a rough todo/in_progress/done status per task, so
        // `projectAgendaTasks` can include a due-less task that's in flight.
        const boardsByCollection = new Map<string, Board[]>();
        for (const b of bundle.boards) {
          const list = boardsByCollection.get(b.collectionId) ?? [];
          list.push(b);
          boardsByCollection.set(b.collectionId, list);
        }
        for (const list of boardsByCollection.values()) {
          list.sort((a, b) => a.position - b.position);
        }
        const statusOf = (t: TaskRow): AgendaTaskStatus => {
          const cols = t.collectionId ? boardsByCollection.get(t.collectionId) : undefined;
          const board = t.boardId ? cols?.find((b) => b.id === t.boardId) : undefined;
          if (!board) return "todo";
          if (board.isDone) return "done";
          const firstOpen = cols!.find((b) => !b.isDone);
          return firstOpen && firstOpen.id === board.id ? "todo" : "in_progress";
        };

        const allTasks = await fetchTasks(sb, workspaceId);
        const tasks = projectAgendaTasks(
          allTasks.map((t) => ({ ...t, status: statusOf(t) })),
          memberId,
          args.date,
          lastDay,
        );

        return ok({ date: args.date, timeZone: args.timeZone, days, events, tasks });
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
        isPrivate: z
          .boolean()
          .optional()
          .describe("Only you can see it. Default: false (shared, unchanged)."),
        clientRequestId: z
          .string()
          .min(1)
          .max(100)
          .optional()
          .describe(
            "Caller-chosen idempotency key. Re-calling with the same id returns " +
              "the event already created for it instead of making a duplicate.",
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args, extra) =>
      guard(async () => {
        const { sb, memberId, workspaceId } = mcpContext(extra);
        let start = toMs(args.start);
        let end = toMs(args.end);
        if (end < start) return fail("`end` must be at or after `start`.");
        const timeZone = args.timeZone ?? "UTC";
        if (args.allDay) ({ start, end } = allDayRange(start, end, timeZone));
        const input: EventInput = {
          workspaceId,
          ownerId: memberId,
          title: args.title,
          start,
          end,
          timeZone,
          allDay: args.allDay ?? false,
          description: args.description ?? null,
          location: args.location ?? null,
          categoryId: args.categoryId ?? null,
          rrule: args.rrule ?? null,
          isPrivate: args.isPrivate ?? false,
          clientRequestId: args.clientRequestId,
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
        "completion or tag. Returns compact rows (with tags, `position` = order " +
        "among siblings, and `blockedBy` = ids of the tasks it waits for, omitted " +
        "when none); use get_workspace to resolve board names.",
      inputSchema: {
        collectionId: z.string().optional(),
        boardId: z.string().optional(),
        tag: z
          .string()
          .optional()
          .describe("Only tasks carrying this tag (case-insensitive, '#' optional)."),
        includeCompleted: z
          .boolean()
          .optional()
          .describe("Include done tasks. Default: true."),
        includeSubtasks: z
          .boolean()
          .optional()
          .describe("Include subtasks (parentId set). Default: true."),
        mine: z
          .boolean()
          .optional()
          .describe("Only tasks you own (created). Default: false."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, extra) =>
      guard(async () => {
        const { sb, workspaceId, memberId } = mcpContext(extra);
        const [all, deps] = await Promise.all([
          fetchTasks(sb, workspaceId),
          fetchTaskDependencies(sb, workspaceId),
        ]);
        let tasks = all;
        if (args.collectionId)
          tasks = tasks.filter((t) => t.collectionId === args.collectionId);
        if (args.boardId) tasks = tasks.filter((t) => t.boardId === args.boardId);
        if (args.tag !== undefined) {
          const tag = normalizeTag(args.tag);
          if (tag === null) return fail("`tag` is empty.");
          tasks = tasks.filter((t) => t.tags.includes(tag));
        }
        if (args.includeCompleted === false)
          tasks = tasks.filter((t) => t.completedAt == null);
        if (args.mine === true) tasks = tasks.filter((t) => t.ownerId === memberId);
        if (args.includeSubtasks === false)
          tasks = tasks.filter((t) => t.parentId == null);
        const blockersById = new Map<string, string[]>();
        for (const d of deps) {
          const ids = blockersById.get(d.taskId);
          if (ids) ids.push(d.dependsOnTaskId);
          else blockersById.set(d.taskId, [d.dependsOnTaskId]);
        }
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
            tags: t.tags?.length ? t.tags : undefined,
            position: t.position,
            blockedBy: blockersById.get(t.id),
          })),
        });
      }),
  );

  // -- tasks: streams -----------------------------------------------------
  server.registerTool(
    "get_flows",
    {
      title: "Get flows (attention by stream)",
      description:
        "Which tasks need attention now, stream by stream. Tasks are split into " +
        "streams by `groupBy` (a task with several tags is in each tag's stream) " +
        "and each stream is scored from its open tasks' deadlines and priorities " +
        "(a subtask counts toward its parent). Streams come back most-pressing " +
        "first, each with its counts and its top `limit` open tasks. Pass `stream` " +
        "(a saved stream's id or name, see get_workspace) to use its filter, " +
        "grouping and attention mode; explicit `groupBy`/`attention` override it. " +
        "Includes the partner's shared tasks (never their private ones) unless " +
        "`mine: true`. Never returns task descriptions.",
      inputSchema: flowsInputShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, extra) =>
      guard(async () => {
        const flows = await loadFlows(args, extra);
        return typeof flows === "string" ? fail(flows) : ok(flows);
      }),
  );

  // The same streams as a view: an MCP App the host renders in the chat.
  // The view gets every stream's open tasks (up to SHOW_FLOWS_TASKS) so the
  // user can expand a stream in place; the model's text keeps `limit` per
  // stream, as get_flows would answer.
  registerFlowsApp(server, flowsInputShape, async (args, extra) => {
    try {
      const flows = await loadFlows({ ...args, limit: SHOW_FLOWS_TASKS, withSubtasks: true }, extra);
      if (typeof flows === "string") return fail(flows);
      const perStream = args.limit ?? 3;
      // The subtask trees and link ids are for the view to draw; the model's
      // text stays as get_flows would answer.
      const forModel: FlowsOut = {
        ...flows,
        streams: flows.streams.map((st) => ({
          ...st,
          tasks: st.tasks.slice(0, perStream).map(withoutViewFields),
        })),
      };
      return { ...ok(forModel), structuredContent: flows as unknown as Record<string, unknown> };
    } catch (err) {
      return errorResult(err);
    }
  });

  // The view's "Sync with Obsidian" button: Echo runs one board-sync pass with
  // the member's own token as proof of who asked (lib/mcp/echo-sync.ts).
  registerSyncBoards(server, async (_args, extra) => {
    try {
      const { token } = mcpContext(extra);
      const result = await requestBoardSync(token);
      return result.ok ? ok(result.data) : fail(result.message);
    } catch (err) {
      return errorResult(err);
    }
  });

  server.registerTool(
    "get_task",
    {
      title: "Get task",
      description:
        "One task by id with its editable fields, whether its subtasks are 'do in " +
        "order' (`sequential`), its dependencies (`blockedBy`: the tasks it waits " +
        "for; `blocks`: the tasks waiting for it; each {id, title, done}) and its " +
        "whole subtask tree (flattened, parent before child, each with its depth, " +
        "`sequential`, `blocked` = waiting on an unfinished dependency or an " +
        "earlier sibling, start/due dates and `blockedBy` ids). RLS-scoped. " +
        "Never returns descriptions.",
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, extra) =>
      guard(async () => {
        const { sb, workspaceId } = mcpContext(extra);
        const [tasks, deps] = await Promise.all([
          fetchTasks(sb, workspaceId),
          fetchTaskDependencies(sb, workspaceId),
        ]);
        const task = tasks.find((t) => t.id === args.id);
        if (!task) return fail(`No task with id ${args.id} is visible to you.`);
        return ok(projectTaskDetail(task, tasks, deps));
      }),
  );

  // -- tasks: write -------------------------------------------------------
  server.registerTool(
    "create_task",
    {
      title: "Create task",
      description:
        "Create a task you own. Optionally place it in a collection/board and set " +
        "a due date (yyyy-MM-dd), priority (0-3), parent (for a subtask), or " +
        "`blockedBy` (ids of tasks it waits for).",
      inputSchema: {
        title: z.string().min(1).max(500),
        description: z.string().max(5000).optional(),
        collectionId: z.string().optional(),
        boardId: z.string().optional(),
        parentId: z.string().optional().describe("Make this a subtask of this id."),
        categoryId: z.string().optional(),
        priority: z.number().int().min(0).max(3).optional(),
        tags: z
          .array(z.string().max(MAX_TAG_LENGTH * 2))
          .max(MAX_TAGS * 2)
          .optional()
          .describe("Free-form labels (normalized: lowercase, '#' dropped, max 12)."),
        dueDate: z
          .iso.date()
          .nullable()
          .optional()
          .describe("Calendar date, yyyy-MM-dd, or null for none."),
        startDate: z
          .iso.date()
          .nullable()
          .optional()
          .describe("Planned start, yyyy-MM-dd, or null for none."),
        blockedBy: blockedBySchema
          .optional()
          .describe(
            `Ids of tasks this one waits for (max ${MAX_BLOCKED_BY}); each must be a task you can see.`,
          ),
        clientRequestId: z
          .string()
          .min(1)
          .max(100)
          .optional()
          .describe(
            "Caller-chosen idempotency key. Re-calling with the same id returns " +
              "the task already created for it instead of making a duplicate.",
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args, extra) =>
      guard(async () => {
        const { sb, memberId, workspaceId } = mcpContext(extra);
        // A subtask lives where its parent lives: same collection, same
        // privacy (the web app does the same), unless the caller says otherwise.
        let parent: TaskRow | undefined;
        const wantsBlockers = args.blockedBy !== undefined && args.blockedBy.length > 0;
        const visible = args.parentId || wantsBlockers ? await fetchTasks(sb, workspaceId) : [];
        if (args.parentId) {
          parent = visible.find((t) => t.id === args.parentId);
          if (!parent) return fail(`No task with id ${args.parentId} is visible to you.`);
        }
        // Checked before anything is written. A new task has no dependents, so
        // its blockers can't make a loop.
        const blockerIds = [...new Set((args.blockedBy ?? []).map((id) => id.trim()))];
        for (const id of blockerIds) {
          if (!visible.some((t) => t.id === id)) return fail(`No task with id ${id} is visible to you.`);
        }
        // A task in a collection sits in one of its columns: without one named,
        // the first open column, as when the web app creates it.
        const collectionId = args.collectionId ?? parent?.collectionId ?? null;
        let boardId = args.boardId ?? null;
        if (collectionId && !boardId) {
          const bundle = await fetchWorkspaceBundle(sb);
          // Only a collection the caller named is checked: an inherited one is
          // the parent's, and the parent was already found.
          if (args.collectionId && !bundle.collections.some((c) => c.id === collectionId))
            return fail(`No collection with id ${collectionId} is visible to you.`);
          boardId = landingBoardId(bundle.boards, collectionId, false);
        }
        const input: TaskInput = {
          workspaceId,
          ownerId: memberId,
          title: args.title,
          description: args.description ?? null,
          collectionId,
          boardId,
          parentId: args.parentId ?? null,
          categoryId: args.categoryId ?? null,
          priority: args.priority ?? null,
          dueDate: args.dueDate ?? null,
          startDate: args.startDate ?? null,
          ...(parent ? { isPrivate: parent.isPrivate } : {}),
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
          clientRequestId: args.clientRequestId,
        };
        const row = await createTask(sb, input);
        if (args.blockedBy === undefined) return ok({ id: row.id, title: row.title });
        // A retried create (same clientRequestId) hands back the existing task:
        // its blockers may already be there.
        const deps = blockerIds.length > 0 ? await fetchTaskDependencies(sb, workspaceId) : [];
        const plan = planBlockedBy(row, blockerIds, [...visible, row], deps.filter((d) => d.taskId === row.id));
        if (typeof plan === "string") return fail(plan);
        const applied = await applyBlockedBy(sb, workspaceId, row.id, { ...plan, remove: [] });
        if (typeof applied === "string") {
          return fail(`Created the task (id ${row.id}), but couldn't set what it waits for. ${applied}`);
        }
        return ok({ id: row.id, title: row.title, blockedBy: applied });
      }),
  );

  server.registerTool(
    "update_task",
    {
      title: "Update task",
      description:
        "Update fields of a task by id. Only provided fields change. To complete " +
        "a task prefer complete_task (it also moves it to the done board). " +
        "`blockedBy` replaces the set of tasks it waits for ([] clears it); a " +
        "dependency loop is refused, and then nothing else in the call is changed " +
        "either. Only the task's owner can change it.",
      inputSchema: {
        id: z.string(),
        title: z.string().min(1).max(500).optional(),
        description: z.string().max(5000).nullable().optional(),
        boardId: z.string().nullable().optional(),
        priority: z.number().int().min(0).max(3).nullable().optional(),
        dueDate: z.string().nullable().optional(),
        startDate: z.iso.date().nullable().optional().describe("Planned start, yyyy-MM-dd, or null."),
        collectionId: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Move the task, with its whole subtask tree, to this collection (null = " +
              "no collection). Each lands in that collection's first open column, or " +
              "its done column if finished.",
          ),
        tags: z
          .array(z.string().max(MAX_TAG_LENGTH * 2))
          .max(MAX_TAGS * 2)
          .optional()
          .describe("Replace the task's tags (normalized). [] clears them."),
        blockedBy: blockedBySchema
          .optional()
          .describe(
            `Replace the ids of the tasks this one waits for (max ${MAX_BLOCKED_BY}; [] clears). ` +
              "The result returns the final `blockedBy`.",
          ),
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
        if (args.startDate !== undefined) patch.startDate = args.startDate;
        if (args.tags !== undefined) patch.tags = args.tags;

        // Dependencies: validated (and a loop refused) before anything is written.
        let plan: BlockedByPlan | undefined;
        let loaded: { tasks: TaskRow[]; task: TaskRow } | undefined;
        if (args.blockedBy !== undefined) {
          const { workspaceId, memberId } = mcpContext(extra);
          const [tasks, deps] = await Promise.all([
            fetchTasks(sb, workspaceId),
            fetchTaskDependencies(sb, workspaceId),
          ]);
          const task = tasks.find((t) => t.id === args.id);
          if (!task) return fail(`No task with id ${args.id} is visible to you.`);
          if (task.ownerId !== memberId)
            return fail("Only the task's owner can change what it waits for.");
          const planned = planBlockedBy(task, args.blockedBy, tasks, deps);
          if (typeof planned === "string") return fail(planned);
          plan = planned;
          loaded = { tasks, task };
        }
        // Dependencies are written before any field, so a set the database
        // refuses (a loop through tasks the caller can't see) leaves the task
        // exactly as it was: never "fields saved, but the call failed".
        // `applyBlockedBy` takes back its own partial adds on that refusal.
        let applied: string[] | undefined;
        const depsFirst = async (): Promise<CallToolResult | undefined> => {
          if (!plan) return undefined;
          const { workspaceId } = mcpContext(extra);
          const result = await applyBlockedBy(sb, workspaceId, args.id, plan);
          if (typeof result === "string") return fail(result);
          applied = result;
          return undefined;
        };
        const done = (result: Record<string, unknown>): CallToolResult =>
          ok(applied === undefined ? result : { ...result, blockedBy: applied });

        if (args.collectionId === undefined) {
          if (Object.keys(patch).length === 0) {
            if (!loaded) return fail("Provide at least one field to update.");
            const { task } = loaded;
            return (await depsFirst()) ?? done({ id: task.id, title: task.title });
          }
          const refused = await depsFirst();
          if (refused) return refused;
          const row = await updateTask(sb, args.id, patch);
          return done({ id: row.id, title: row.title });
        }

        // A move. Subtasks live where their parent lives, and a column belongs
        // to one collection, so the whole subtree moves and each task takes a
        // column of the new collection. Parents go before children and siblings
        // in order, so a "do in order" parent never sees a later subtask land
        // in a done column before an earlier one.
        const { workspaceId } = mcpContext(extra);
        const [tasks, bundle] = await Promise.all([
          loaded ? Promise.resolve(loaded.tasks) : fetchTasks(sb, workspaceId),
          fetchWorkspaceBundle(sb),
        ]);
        const task = tasks.find((t) => t.id === args.id);
        if (!task) return fail(`No task with id ${args.id} is visible to you.`);
        const target = args.collectionId;
        if (target !== null && !bundle.collections.some((c) => c.id === target))
          return fail(`No collection with id ${target} is visible to you.`);
        if (task.parentId && target !== task.collectionId)
          return fail("A subtask stays in its parent's collection. Move the parent instead.");
        const refused = await depsFirst();
        if (refused) return refused;
        if (target === task.collectionId) {
          if (Object.keys(patch).length === 0) return done({ id: task.id, title: task.title, moved: 0 });
          const row = await updateTask(sb, args.id, patch);
          return done({ id: row.id, title: row.title, moved: 0 });
        }
        const moving = subtreeInOrder(task, tasks);
        let moved = 0;
        let title = task.title;
        for (const item of moving) {
          const step: Partial<TaskInput> = {
            ...(item.id === task.id ? patch : {}),
            collectionId: target,
            boardId: landingBoardId(bundle.boards, target, item.completedAt != null),
          };
          const row = await updateTask(sb, item.id, step);
          if (item.id === task.id) title = row.title;
          moved++;
        }
        return done({ id: task.id, title, moved });
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
        // Time actually asleep, when a tracker (Health Connect) reported stages.
        const asleep = recent
          .map((l) => l.asleepMin)
          .filter((m): m is number => m != null)
          .map((m) => m / 60);
        return ok({
          nights: recent.length,
          avgDurationHrs: avg(durations),
          avgAsleepHrs: avg(asleep),
          avgQuality: avg(qualities),
          logs: recent.map((l) => ({
            date: l.date,
            bedtime: l.bedtimeAt ? toIso(l.bedtimeAt) : undefined,
            woke: l.wokeAt ? toIso(l.wokeAt) : undefined,
            quality: l.quality ?? undefined,
            fatigue: l.fatigue ?? undefined,
            asleepMin: l.asleepMin ?? undefined,
            stagesMin:
              l.deepMin != null || l.lightMin != null || l.remMin != null
                ? { deep: l.deepMin, light: l.lightMin, rem: l.remMin, awake: l.awakeMin }
                : undefined,
            source: l.timesSource,
          })),
        });
      }),
  );
}
