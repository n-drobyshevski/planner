import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EventRow,
  TaskRow,
  ThemePreference,
  AccentId,
  SurfaceTone,
  Palette,
} from "@/lib/types";
import {
  mapEvent,
  mapTask,
  eventInputToRow,
  eventPatchToRow,
  taskInputToRow,
  taskPatchToRow,
  type EventInput,
  type TaskInput,
} from "./mappers";
import {
  editAll,
  splitThisAndFuture,
  type OccurrencePatch,
  type OverrideInput,
} from "@/lib/recurrence/edit-semantics";
import { buildRRule, parseRRule } from "@/lib/recurrence/rrule-build";

export class StaleWriteError extends Error {
  constructor(
    message = "This event was changed elsewhere. Reloaded the latest version.",
  ) {
    super(message);
    this.name = "StaleWriteError";
  }
}

const toIso = (ms: number) => new Date(ms).toISOString();

export async function createEvent(
  sb: SupabaseClient,
  input: EventInput,
): Promise<EventRow> {
  const { data, error } = await sb
    .from("events")
    .insert(eventInputToRow(input))
    .select()
    .single();
  if (error) throw error;
  return mapEvent(data);
}

/**
 * Update a master event. When `expectedUpdatedAt` is given, the write is
 * rejected (StaleWriteError) if another client changed the row meanwhile.
 */
export async function updateEvent(
  sb: SupabaseClient,
  id: string,
  patch: Partial<EventInput>,
  expectedUpdatedAt?: number,
): Promise<EventRow> {
  let q = sb.from("events").update(eventPatchToRow(patch)).eq("id", id);
  if (expectedUpdatedAt != null) q = q.eq("updated_at", toIso(expectedUpdatedAt));
  const { data, error } = await q.select();
  if (error) throw error;
  if (!data || data.length === 0) throw new StaleWriteError();
  return mapEvent(data[0]);
}

export function moveEvent(
  sb: SupabaseClient,
  id: string,
  start: number,
  end: number,
  expectedUpdatedAt?: number,
): Promise<EventRow> {
  return updateEvent(sb, id, { start, end }, expectedUpdatedAt);
}

export async function deleteEvent(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("events").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Raw rows captured before a delete so undo can re-insert them verbatim. We
 * keep the full Postgres rows (not the domain shape) because restore must
 * preserve every column — including ones the app layer doesn't model (scope,
 * visibility) — and the original ids, so all links (task_id, parent_id,
 * context_id, override→event) survive the round-trip intact.
 */
export interface DeletedSnapshot {
  /** Parent-before-child order; restore inserts them in this order. */
  tasks: Record<string, unknown>[];
  events: Record<string, unknown>[];
  overrides: Record<string, unknown>[];
}

/**
 * Delete an event after snapshotting it (and its occurrence overrides, which
 * cascade) so the delete can be undone by `restoreDeleted`.
 */
export async function deleteEventDeep(
  sb: SupabaseClient,
  id: string,
): Promise<DeletedSnapshot> {
  const { data: events, error: eErr } = await sb
    .from("events")
    .select("*")
    .eq("id", id);
  if (eErr) throw eErr;
  const { data: overrides, error: oErr } = await sb
    .from("event_overrides")
    .select("*")
    .eq("event_id", id);
  if (oErr) throw oErr;
  const { error } = await sb.from("events").delete().eq("id", id);
  if (error) throw error;
  return { tasks: [], events: events ?? [], overrides: overrides ?? [] };
}

/**
 * Delete a task after snapshotting its whole subtree (descendant tasks via
 * parent_id) plus the calendar blocks linked to any of those tasks and their
 * overrides — all of which the DB cascades away. `restoreDeleted` re-inserts
 * the snapshot to bring the task, its subtasks, and its blocks back.
 */
export async function deleteTaskDeep(
  sb: SupabaseClient,
  id: string,
): Promise<DeletedSnapshot> {
  // BFS the subtree so arbitrary nesting depth is captured parent-before-child.
  const { data: root, error: rErr } = await sb
    .from("tasks")
    .select("*")
    .eq("id", id);
  if (rErr) throw rErr;
  const tasks: Record<string, unknown>[] = [...(root ?? [])];
  let frontier = tasks.map((t) => t.id as string);
  while (frontier.length > 0) {
    const { data: children, error: cErr } = await sb
      .from("tasks")
      .select("*")
      .in("parent_id", frontier);
    if (cErr) throw cErr;
    if (!children || children.length === 0) break;
    tasks.push(...children);
    frontier = children.map((c) => c.id as string);
  }

  const taskIds = tasks.map((t) => t.id as string);
  const { data: events, error: eErr } = await sb
    .from("events")
    .select("*")
    .in("task_id", taskIds);
  if (eErr) throw eErr;
  const eventIds = (events ?? []).map((e) => e.id as string);
  let overrides: Record<string, unknown>[] = [];
  if (eventIds.length > 0) {
    const { data, error: oErr } = await sb
      .from("event_overrides")
      .select("*")
      .in("event_id", eventIds);
    if (oErr) throw oErr;
    overrides = data ?? [];
  }

  // Deleting the root cascades to descendant tasks, their linked blocks, and
  // those blocks' overrides — so one delete clears everything we snapshotted.
  const { error } = await sb.from("tasks").delete().eq("id", id);
  if (error) throw error;
  return { tasks, events: events ?? [], overrides };
}

/**
 * Re-insert a `DeletedSnapshot` to undo a delete. Tasks go first (in captured
 * parent-before-child order, inserted one at a time to satisfy the self-
 * referential parent_id FK), then the linked blocks, then their overrides.
 */
export async function restoreDeleted(
  sb: SupabaseClient,
  snap: DeletedSnapshot,
): Promise<void> {
  for (const task of snap.tasks) {
    const { error } = await sb.from("tasks").insert(task);
    if (error) throw error;
  }
  if (snap.events.length > 0) {
    const { error } = await sb.from("events").insert(snap.events);
    if (error) throw error;
  }
  if (snap.overrides.length > 0) {
    const { error } = await sb.from("event_overrides").insert(snap.overrides);
    if (error) throw error;
  }
}

/** Group an event under a context (or move it to a different one). */
export function assignToContext(
  sb: SupabaseClient,
  eventId: string,
  contextId: string,
  expectedUpdatedAt?: number,
): Promise<EventRow> {
  return updateEvent(sb, eventId, { contextId }, expectedUpdatedAt);
}

/** Detach an event from its context (the event stays on the calendar). */
export function removeFromContext(
  sb: SupabaseClient,
  eventId: string,
  expectedUpdatedAt?: number,
): Promise<EventRow> {
  return updateEvent(sb, eventId, { contextId: null }, expectedUpdatedAt);
}

// --- Recurring edits -------------------------------------------------------

/** Apply a cancel/modify override for a single occurrence (this-occurrence edit). */
export async function applyOverride(
  sb: SupabaseClient,
  workspaceId: string,
  input: OverrideInput,
): Promise<void> {
  const row: Record<string, unknown> = {
    workspace_id: workspaceId,
    event_id: input.eventId,
    occurrence_date: toIso(input.occurrenceDate),
    type: input.type,
  };
  const p = input.patch;
  if (input.type === "modify" && p) {
    if ("title" in p) row.title = p.title ?? null;
    if ("description" in p) row.description = p.description ?? null;
    if ("location" in p) row.location = p.location ?? null;
    if ("categoryId" in p) row.category_id = p.categoryId ?? null;
    if (p.start != null) row.starts_at = toIso(p.start);
    if (p.end != null) row.ends_at = toIso(p.end);
    if (p.allDay != null) row.all_day = p.allDay;
  }
  const { error } = await sb
    .from("event_overrides")
    .upsert(row, { onConflict: "event_id,occurrence_date" });
  if (error) throw error;
}

/** "All events": edit the master row. */
export async function updateAll(
  sb: SupabaseClient,
  event: EventRow,
  patch: OccurrencePatch,
): Promise<EventRow> {
  const fields = editAll(event, patch);
  return updateEvent(sb, event.id, fields as Partial<EventInput>);
}

/**
 * "This and future": cap the original series and create a new one. The new
 * series inherits the original's kind + context membership; pass `newContextId`
 * (string | null) to re-file the new series under a different context, and
 * `newColor` (string | null) to give the future series a different own-color.
 */
export async function splitSeries(
  sb: SupabaseClient,
  event: EventRow,
  fromOccurrenceMs: number,
  patch: OccurrencePatch,
  newContextId?: string | null,
  newColor?: string | null,
): Promise<EventRow> {
  const { original, newSeries } = splitThisAndFuture(event, fromOccurrenceMs, patch);
  const { error } = await sb
    .from("events")
    .update({
      rrule: original.rrule,
      recurrence_ends_at:
        original.recurrenceEndsAt == null ? null : toIso(original.recurrenceEndsAt),
    })
    .eq("id", original.id);
  if (error) throw error;

  const input: EventInput = {
    workspaceId: newSeries.workspaceId,
    ownerId: newSeries.ownerId,
    categoryId: newSeries.categoryId,
    title: newSeries.title,
    description: newSeries.description,
    location: newSeries.location,
    isPrivate: newSeries.isPrivate,
    color: newColor !== undefined ? newColor : newSeries.color,
    kind: newSeries.kind,
    contextId: newContextId !== undefined ? newContextId : newSeries.contextId,
    allDay: newSeries.allDay,
    inactive: newSeries.inactive,
    start: newSeries.start,
    end: newSeries.end,
    timeZone: newSeries.timeZone,
    rrule: newSeries.rrule,
    recurrenceEndsAt: newSeries.recurrenceEndsAt,
    taskId: newSeries.taskId,
  };
  return createEvent(sb, input);
}

/** "This and following": cap the series with UNTIL just before the occurrence. */
export async function deleteThisAndFuture(
  sb: SupabaseClient,
  event: EventRow,
  fromOccurrenceMs: number,
): Promise<void> {
  const form = parseRRule(event.rrule);
  const untilMs = fromOccurrenceMs - 1000;
  const rrule = form
    ? buildRRule({ ...form, end: { type: "until", dateMs: untilMs } })
    : null;
  await updateEvent(sb, event.id, { rrule, recurrenceEndsAt: untilMs });
}

// --- Categories ------------------------------------------------------------

export async function createCategory(
  sb: SupabaseClient,
  input: { workspaceId: string; ownerId: string | null; name: string; color: string; sortOrder?: number },
): Promise<void> {
  const { error } = await sb.from("categories").insert({
    workspace_id: input.workspaceId,
    owner_id: input.ownerId,
    name: input.name,
    color: input.color,
    sort_order: input.sortOrder ?? 0,
  });
  if (error) throw error;
}

export async function updateCategory(
  sb: SupabaseClient,
  id: string,
  patch: { name?: string; color?: string; sortOrder?: number },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name != null) row.name = patch.name;
  if (patch.color != null) row.color = patch.color;
  if (patch.sortOrder != null) row.sort_order = patch.sortOrder;
  const { error } = await sb.from("categories").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("categories").delete().eq("id", id);
  if (error) throw error;
}

// --- Member preferences ----------------------------------------------------

export interface MemberPreferencesPatch {
  themePreference?: ThemePreference;
  accent?: AccentId;
  surfaceTone?: SurfaceTone;
  palette?: Palette;
  /** IANA zone, or null to clear it (= follow the device). */
  timezone?: string | null;
  /** IANA zone, or null to turn the secondary zone off. */
  secondaryTimezone?: string | null;
  /** Whether inactive events are shown in the month view. */
  showInactiveInMonth?: boolean;
}

/**
 * Update a member's identity (name / accent color). RLS (members_update_self)
 * restricts this to the signed-in member's own row, so the partner's calendar
 * stays read-only from the sidebar.
 */
export async function updateMember(
  sb: SupabaseClient,
  id: string,
  patch: { name?: string; color?: string },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name != null) row.name = patch.name;
  if (patch.color != null) row.color = patch.color;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("members").update(row).eq("id", id);
  if (error) throw error;
}

/**
 * Set (hash) or clear (null) the member's PIN. RLS (members_update_self) scopes
 * it to the signed-in member's own row.
 */
export async function updateMemberPin(
  sb: SupabaseClient,
  id: string,
  pinHash: string | null,
): Promise<void> {
  const { error } = await sb.from("members").update({ pin_hash: pinHash }).eq("id", id);
  if (error) throw error;
}

/** Update the signed-in member's appearance preferences. RLS (members_update_self) scopes it. */
export async function updateMemberPreferences(
  sb: SupabaseClient,
  memberId: string,
  patch: MemberPreferencesPatch,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.themePreference != null) row.theme_preference = patch.themePreference;
  if (patch.accent != null) row.accent = patch.accent;
  if (patch.surfaceTone != null) row.surface_tone = patch.surfaceTone;
  if (patch.palette != null) row.palette = patch.palette;
  // `timezone`/`secondaryTimezone` are nullable: an explicit null clears the
  // column (= follow device / turn secondary off), so key on presence, not value.
  if ("timezone" in patch) row.timezone = patch.timezone ?? null;
  if ("secondaryTimezone" in patch) row.secondary_timezone = patch.secondaryTimezone ?? null;
  if (patch.showInactiveInMonth != null) row.show_inactive_in_month = patch.showInactiveInMonth;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("members").update(row).eq("id", memberId);
  if (error) throw error;
}

// --- Tasks -----------------------------------------------------------------

export async function createTask(
  sb: SupabaseClient,
  input: TaskInput,
): Promise<TaskRow> {
  const { data, error } = await sb
    .from("tasks")
    .insert(taskInputToRow(input))
    .select()
    .single();
  if (error) throw error;
  return mapTask(data);
}

/**
 * Update a task. When `expectedUpdatedAt` is given, the write is rejected
 * (StaleWriteError) if another client changed the row meanwhile.
 */
export async function updateTask(
  sb: SupabaseClient,
  id: string,
  patch: Partial<TaskInput>,
  expectedUpdatedAt?: number,
): Promise<TaskRow> {
  let q = sb.from("tasks").update(taskPatchToRow(patch)).eq("id", id);
  if (expectedUpdatedAt != null) q = q.eq("updated_at", toIso(expectedUpdatedAt));
  const { data, error } = await q.select();
  if (error) throw error;
  if (!data || data.length === 0)
    throw new StaleWriteError(
      "This task was changed elsewhere. Reloaded the latest version.",
    );
  return mapTask(data[0]);
}

export async function deleteTask(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Schedule a task onto the calendar as one or more real event-blocks ("parts").
 * Each block carries task_id and inherits the task's scope/visibility/owner so
 * RLS stays consistent. `timeZone` is the IANA zone the blocks are stored in.
 */
export async function scheduleTaskBlocks(
  sb: SupabaseClient,
  task: TaskRow,
  segments: { start: number; end: number; title?: string }[],
  timeZone: string,
): Promise<EventRow[]> {
  if (segments.length === 0) return [];
  const rows = segments.map((seg) =>
    eventInputToRow({
      workspaceId: task.workspaceId,
      ownerId: task.ownerId,
      categoryId: task.categoryId,
      title: seg.title ?? task.title,
      description: task.description,
      isPrivate: task.isPrivate,
      allDay: false,
      start: seg.start,
      end: seg.end,
      timeZone,
      taskId: task.id,
    }),
  );
  const { data, error } = await sb.from("events").insert(rows).select();
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}

/**
 * Schedule blocks where each block links to its own task (used when scheduling
 * subtasks back-to-back, so toggling a block toggles the right subtask). Each
 * block inherits its task's scope/visibility/owner.
 */
export async function scheduleBlocks(
  sb: SupabaseClient,
  items: { task: TaskRow; start: number; end: number; title?: string }[],
  timeZone: string,
): Promise<EventRow[]> {
  if (items.length === 0) return [];
  const rows = items.map((it) =>
    eventInputToRow({
      workspaceId: it.task.workspaceId,
      ownerId: it.task.ownerId,
      categoryId: it.task.categoryId,
      title: it.title ?? it.task.title,
      description: it.task.description,
      isPrivate: it.task.isPrivate,
      allDay: false,
      start: it.start,
      end: it.end,
      timeZone,
      taskId: it.task.id,
    }),
  );
  const { data, error } = await sb.from("events").insert(rows).select();
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}
