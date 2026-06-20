import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CategoryGoal,
  EventRow,
  InsightsPrefs,
  InsightsView,
  SleepLog,
  MemberSleepPrefs,
  TaskRow,
  TaskCheckpoint,
  TaskDependency,
  Board,
  AppLocale,
  ThemePreference,
  AccentId,
  SurfaceTone,
  Palette,
  ContextLabel,
} from "@/lib/types";
import {
  mapCategoryGoal,
  mapEvent,
  mapInsightsPrefs,
  mapInsightsView,
  mapSleepLog,
  mapMemberSleepPrefs,
  mapTask,
  mapBoard,
  mapCheckpoint,
  mapTaskDependency,
  taskDependencyInputToRow,
  categoryGoalInputToRow,
  eventInputToRow,
  eventPatchToRow,
  insightsViewInputToRow,
  sleepLogInputToRow,
  memberSleepPrefsInputToRow,
  taskInputToRow,
  taskPatchToRow,
  boardInputToRow,
  boardPatchToRow,
  checkpointInputToRow,
  checkpointPatchToRow,
  type CategoryGoalInput,
  type EventInput,
  type InsightsViewInput,
  type SleepLogInput,
  type MemberSleepPrefsInput,
  type TaskInput,
  type BoardInput,
  type CheckpointInput,
  type TaskDependencyInput,
} from "./mappers";
import {
  editAll,
  splitThisAndFuture,
  type OccurrencePatch,
  type OverrideInput,
} from "@/lib/recurrence/edit-semantics";
import {
  taskInputSchema,
  taskPatchSchema,
  collectionInputSchema,
  collectionPatchSchema,
  boardInputSchema,
  boardPatchSchema,
  checkpointInputSchema,
  checkpointPatchSchema,
  parseInput,
} from "@/lib/tasks/schemas";
import { buildRRule, parseRRule } from "@/lib/recurrence/rrule-build";
import type { ItemAttributes } from "@/lib/attributes/schema";

export class StaleWriteError extends Error {
  constructor(
    message = "This event was changed elsewhere. Reloaded the latest version.",
  ) {
    super(message);
    this.name = "StaleWriteError";
  }
}

const toIso = (ms: number) => new Date(ms).toISOString();

/**
 * Apply an optimistic-concurrency guard on `updated_at`. The column is
 * microsecond-precision in Postgres, but the domain layer carries timestamps as
 * integer milliseconds, so an exact `eq` match would (almost) always miss the
 * sub-millisecond digits. Match the 1 ms window the expected value falls in
 * instead — i.e. "the row still has the updated_at I last saw, at ms
 * resolution". A genuine partner edit lands on a different millisecond and so
 * still fails the guard.
 */
function guardUpdatedAt<Q extends { gte: (c: string, v: string) => Q; lt: (c: string, v: string) => Q }>(
  q: Q,
  expectedUpdatedAt: number,
): Q {
  return q.gte("updated_at", toIso(expectedUpdatedAt)).lt("updated_at", toIso(expectedUpdatedAt + 1));
}

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
  if (expectedUpdatedAt != null) q = guardUpdatedAt(q, expectedUpdatedAt);
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
 * override→event) survive the round-trip intact.
 */
export interface DeletedSnapshot {
  /** Parent-before-child order; restore inserts them in this order. */
  tasks: Record<string, unknown>[];
  events: Record<string, unknown>[];
  overrides: Record<string, unknown>[];
  /** Flow checkpoints of the deleted tasks (cascade-deleted; restored on undo). */
  checkpoints: Record<string, unknown>[];
  /** Dependency edges touching the deleted subtree (cascade-deleted; restored). */
  dependencies: Record<string, unknown>[];
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
  return {
    tasks: [],
    events: events ?? [],
    overrides: overrides ?? [],
    checkpoints: [],
    dependencies: [],
  };
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
  const [evRes, cpRes, depRes] = await Promise.all([
    sb.from("events").select("*").in("task_id", taskIds),
    sb.from("task_checkpoints").select("*").in("task_id", taskIds),
    // Edges where either endpoint is in the subtree cascade-delete; snapshot both.
    sb
      .from("task_dependencies")
      .select("*")
      .or(`task_id.in.(${taskIds.join(",")}),depends_on_task_id.in.(${taskIds.join(",")})`),
  ]);
  if (evRes.error) throw evRes.error;
  if (cpRes.error) throw cpRes.error;
  if (depRes.error) throw depRes.error;
  const events = evRes.data ?? [];
  const checkpoints = cpRes.data ?? [];
  const dependencies = depRes.data ?? [];
  const eventIds = events.map((e) => e.id as string);
  let overrides: Record<string, unknown>[] = [];
  if (eventIds.length > 0) {
    const { data, error: oErr } = await sb
      .from("event_overrides")
      .select("*")
      .in("event_id", eventIds);
    if (oErr) throw oErr;
    overrides = data ?? [];
  }

  // Deleting the root cascades to descendant tasks, their linked blocks, those
  // blocks' overrides, and the tasks' checkpoints — so one delete clears
  // everything we snapshotted.
  const { error } = await sb.from("tasks").delete().eq("id", id);
  if (error) throw error;
  return { tasks, events, overrides, checkpoints, dependencies };
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
  if (snap.checkpoints.length > 0) {
    const { error } = await sb.from("task_checkpoints").insert(snap.checkpoints);
    if (error) throw error;
  }
  // Dependencies last: both endpoints (tasks) are back, and the re-inserted set
  // was a valid DAG, so the acyclic guard passes.
  if (snap.dependencies.length > 0) {
    const { error } = await sb.from("task_dependencies").insert(snap.dependencies);
    if (error) throw error;
  }
}

/**
 * Add a blocks/blocked-by edge: `taskId` becomes blocked until `dependsOnTaskId`
 * is done. The DB rejects a duplicate (unique) or a cycle (trigger). Returns the
 * inserted row (its id drives the undo / optimistic cache).
 */
export async function addDependency(
  sb: SupabaseClient,
  input: TaskDependencyInput,
): Promise<TaskDependency> {
  const { data, error } = await sb
    .from("task_dependencies")
    .insert(taskDependencyInputToRow(input))
    .select()
    .single();
  if (error) throw error;
  return mapTaskDependency(data);
}

/** Remove a dependency edge by id. */
export async function removeDependency(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("task_dependencies").delete().eq("id", id);
  if (error) throw error;
}

// --- Recurring edits -------------------------------------------------------

/**
 * Apply a cancel/modify override for a single occurrence (this-occurrence edit).
 * Returns any pre-existing override row for this occurrence (or null) so the
 * change can be undone via `revertOverride`. The prior-read is best-effort: a
 * failed read never blocks the edit, it just yields a delete-style inverse.
 */
export async function applyOverride(
  sb: SupabaseClient,
  workspaceId: string,
  input: OverrideInput,
): Promise<{ prior: Record<string, unknown> | null }> {
  const { data: prior } = await sb
    .from("event_overrides")
    .select("*")
    .eq("event_id", input.eventId)
    .eq("occurrence_date", toIso(input.occurrenceDate))
    .maybeSingle();
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
  return { prior: prior ?? null };
}

/**
 * Undo an `applyOverride`: restore the prior override row if there was one,
 * otherwise remove the override entirely (back to the plain occurrence).
 */
export async function revertOverride(
  sb: SupabaseClient,
  eventId: string,
  occurrenceDateMs: number,
  prior: Record<string, unknown> | null,
): Promise<void> {
  if (prior) {
    const { error } = await sb
      .from("event_overrides")
      .upsert(prior, { onConflict: "event_id,occurrence_date" });
    if (error) throw error;
  } else {
    const { error } = await sb
      .from("event_overrides")
      .delete()
      .eq("event_id", eventId)
      .eq("occurrence_date", toIso(occurrenceDateMs));
    if (error) throw error;
  }
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
 * series inherits the original's kind + category; pass `newColor`
 * (string | null) to give the future series a different own-color.
 */
export async function splitSeries(
  sb: SupabaseClient,
  event: EventRow,
  fromOccurrenceMs: number,
  patch: OccurrencePatch,
  newColor?: string | null,
  newAttributes?: ItemAttributes,
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
    isShared: newSeries.isShared,
    hiddenFromPublic: newSeries.hiddenFromPublic,
    color: newColor !== undefined ? newColor : newSeries.color,
    kind: newSeries.kind,
    allDay: newSeries.allDay,
    inactive: newSeries.inactive,
    status: newSeries.status,
    start: newSeries.start,
    end: newSeries.end,
    timeZone: newSeries.timeZone,
    rrule: newSeries.rrule,
    recurrenceEndsAt: newSeries.recurrenceEndsAt,
    taskId: newSeries.taskId,
    attributes: newAttributes !== undefined ? newAttributes : newSeries.attributes,
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
): Promise<string> {
  const { data, error } = await sb
    .from("categories")
    .insert({
      workspace_id: input.workspaceId,
      owner_id: input.ownerId,
      name: input.name,
      color: input.color,
      sort_order: input.sortOrder ?? 0,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
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

/**
 * Convert a context between Personal and Shared by setting its owner: `null`
 * makes it Shared (both members co-own it; every event filed under it becomes a
 * joint event); a member id makes it Personal (owner-only). `categories_write`
 * permits `owner_id` null or self, so a member can only re-own a context they
 * can already edit (their own personal one or a shared one).
 *
 * On a Shared -> Personal conversion the `categories_refile_orphans` trigger
 * (migration 20260629000000) un-files the OTHER member's items from this context
 * (category_id -> null), since they can no longer read it. Without that they'd
 * be left pointing at an unreadable context and render as "Unknown" in Insights.
 */
export async function setCategoryOwner(
  sb: SupabaseClient,
  id: string,
  ownerId: string | null,
): Promise<void> {
  const { error } = await sb.from("categories").update({ owner_id: ownerId }).eq("id", id);
  if (error) throw error;
}

/**
 * Snapshot captured before deleting a category so the delete can be undone.
 * Deleting a category removes the time-blocks ("context" events) that paint it
 * and their overrides outright, and — via `category_id ... on delete set null`
 * — un-links every item that belonged to it. Restore re-inserts the category +
 * its blocks and re-links the items, so one undo brings everything back.
 */
export interface DeletedCategory {
  category: Record<string, unknown>;
  /** kind='context' time-blocks painting this category (deleted). */
  blocks: Record<string, unknown>[];
  /** overrides of those blocks (cascade-deleted with them). */
  blockOverrides: Record<string, unknown>[];
  /** ids of items un-linked by the delete, to re-link on undo. */
  eventIds: string[];
  taskIds: string[];
  overrideIds: string[];
}

/** Delete a category, its calendar time-blocks, and unlink its items (undoable). */
export async function deleteCategory(
  sb: SupabaseClient,
  id: string,
): Promise<DeletedCategory> {
  const { data: cat, error: cErr } = await sb
    .from("categories")
    .select("*")
    .eq("id", id)
    .single();
  if (cErr) throw cErr;

  // Time-blocks painting this category, and their overrides (snapshotted so the
  // undo can re-insert them; they're deleted outright below).
  const { data: blocks, error: bErr } = await sb
    .from("events")
    .select("*")
    .eq("category_id", id)
    .eq("kind", "context");
  if (bErr) throw bErr;
  const blockIds = (blocks ?? []).map((b) => b.id as string);
  let blockOverrides: Record<string, unknown>[] = [];
  if (blockIds.length > 0) {
    const { data, error } = await sb
      .from("event_overrides")
      .select("*")
      .in("event_id", blockIds);
    if (error) throw error;
    blockOverrides = data ?? [];
  }

  // Items (non-block events, tasks, overrides) that will be un-linked by the
  // FK's ON DELETE SET NULL — capture their ids so undo can re-link them.
  const [evRes, tkRes, ovRes] = await Promise.all([
    sb.from("events").select("id").eq("category_id", id).neq("kind", "context"),
    sb.from("tasks").select("id").eq("category_id", id),
    sb.from("event_overrides").select("id").eq("category_id", id),
  ]);
  if (evRes.error) throw evRes.error;
  if (tkRes.error) throw tkRes.error;
  if (ovRes.error) throw ovRes.error;

  // Delete the blocks first (they'd otherwise just be un-linked), then the
  // category — which un-links every remaining item via ON DELETE SET NULL.
  if (blockIds.length > 0) {
    const { error } = await sb.from("events").delete().in("id", blockIds);
    if (error) throw error;
  }
  const { error: delErr } = await sb.from("categories").delete().eq("id", id);
  if (delErr) throw delErr;

  return {
    category: cat as Record<string, unknown>,
    blocks: blocks ?? [],
    blockOverrides,
    eventIds: (evRes.data ?? []).map((r) => r.id as string),
    taskIds: (tkRes.data ?? []).map((r) => r.id as string),
    overrideIds: (ovRes.data ?? []).map((r) => r.id as string),
  };
}

/** Re-insert a deleted category, its time-blocks, and re-link its items. */
export async function restoreCategory(
  sb: SupabaseClient,
  snap: DeletedCategory,
): Promise<void> {
  const { error: cErr } = await sb.from("categories").insert(snap.category);
  if (cErr) throw cErr;
  if (snap.blocks.length > 0) {
    const { error } = await sb.from("events").insert(snap.blocks);
    if (error) throw error;
  }
  if (snap.blockOverrides.length > 0) {
    const { error } = await sb.from("event_overrides").insert(snap.blockOverrides);
    if (error) throw error;
  }
  const id = snap.category.id as string;
  if (snap.eventIds.length > 0) {
    const { error } = await sb.from("events").update({ category_id: id }).in("id", snap.eventIds);
    if (error) throw error;
  }
  if (snap.taskIds.length > 0) {
    const { error } = await sb.from("tasks").update({ category_id: id }).in("id", snap.taskIds);
    if (error) throw error;
  }
  if (snap.overrideIds.length > 0) {
    const { error } = await sb
      .from("event_overrides")
      .update({ category_id: id })
      .in("id", snap.overrideIds);
    if (error) throw error;
  }
}

// --- Collections -----------------------------------------------------------

/** A collection still holds tasks, so it can't be deleted (block-if-non-empty). */
export class CollectionNotEmptyError extends Error {
  constructor(public readonly taskCount: number) {
    super(
      taskCount === 1
        ? "This collection still has 1 task. Move or delete it first."
        : `This collection still has ${taskCount} tasks. Move or delete them first.`,
    );
    this.name = "CollectionNotEmptyError";
  }
}

/** Default column names for a new collection's three seeded boards. */
export interface DefaultBoardNames {
  todo: string;
  inProgress: string;
  done: string;
}

const FALLBACK_BOARD_NAMES: DefaultBoardNames = {
  todo: "To Do",
  inProgress: "In Progress",
  done: "Done",
};

export async function createCollection(
  sb: SupabaseClient,
  input: {
    workspaceId: string;
    ownerId: string | null;
    name: string;
    color: string;
    sortOrder?: number;
    /** Localized labels for the three seeded columns; English fallback otherwise. */
    boardNames?: DefaultBoardNames;
  },
): Promise<string> {
  const parsed = parseInput(collectionInputSchema, input);
  const { data, error } = await sb
    .from("collections")
    .insert({
      workspace_id: parsed.workspaceId,
      owner_id: parsed.ownerId,
      name: parsed.name,
      color: parsed.color,
      sort_order: parsed.sortOrder ?? 0,
    })
    .select("id")
    .single();
  if (error) throw error;
  const collectionId = data.id as string;

  // Seed the three default columns (the right-most is the completion column).
  const names = input.boardNames ?? FALLBACK_BOARD_NAMES;
  const { error: boardErr } = await sb.from("boards").insert([
    { workspace_id: parsed.workspaceId, collection_id: collectionId, name: names.todo, line_style: "solid", position: 0, is_done: false },
    { workspace_id: parsed.workspaceId, collection_id: collectionId, name: names.inProgress, line_style: "solid", position: 1, is_done: false },
    { workspace_id: parsed.workspaceId, collection_id: collectionId, name: names.done, line_style: "solid", position: 2, is_done: true },
  ]);
  if (boardErr) throw boardErr;
  return collectionId;
}

export async function updateCollection(
  sb: SupabaseClient,
  id: string,
  patch: { name?: string; color?: string; sortOrder?: number },
): Promise<void> {
  const parsed = parseInput(collectionPatchSchema, patch);
  const row: Record<string, unknown> = {};
  if (parsed.name != null) row.name = parsed.name;
  if (parsed.color != null) row.color = parsed.color;
  if (parsed.sortOrder != null) row.sort_order = parsed.sortOrder;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("collections").update(row).eq("id", id);
  if (error) throw error;
}

/**
 * Convert a collection between Personal and Shared by setting its owner: `null`
 * makes it Shared (both members see + edit it), a member id makes it Personal.
 * Mirrors `setCategoryOwner`; `collections_write` only permits `owner_id` null or
 * self, so a member can only re-own a collection they can already edit.
 *
 * On a Shared -> Personal conversion the `collections_refile_orphans` trigger
 * (migration 20260629000000) un-files the OTHER member's tasks from this
 * collection (collection_id -> null), mirroring the context behaviour.
 */
export async function setCollectionOwner(
  sb: SupabaseClient,
  id: string,
  ownerId: string | null,
): Promise<void> {
  const { error } = await sb.from("collections").update({ owner_id: ownerId }).eq("id", id);
  if (error) throw error;
}

/**
 * Delete a collection, but only when it holds no tasks (block-if-non-empty).
 * Throws `CollectionNotEmptyError` otherwise. Returns the deleted row so the
 * delete can be undone by `restoreCollection`.
 */
export async function deleteCollection(
  sb: SupabaseClient,
  id: string,
): Promise<Record<string, unknown>> {
  const { count, error: cntErr } = await sb
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("collection_id", id);
  if (cntErr) throw cntErr;
  if (count && count > 0) throw new CollectionNotEmptyError(count);

  const { data: collection, error: selErr } = await sb
    .from("collections")
    .select("*")
    .eq("id", id)
    .single();
  if (selErr) throw selErr;

  const { error } = await sb.from("collections").delete().eq("id", id);
  if (error) throw error;
  return collection as Record<string, unknown>;
}

/** Re-insert a deleted collection (undo). */
export async function restoreCollection(
  sb: SupabaseClient,
  collection: Record<string, unknown>,
): Promise<void> {
  const { error } = await sb.from("collections").insert(collection);
  if (error) throw error;
}

// --- Boards (collection columns) -------------------------------------------

/** A board (column) still holds tasks, so it can't be deleted. */
export class BoardNotEmptyError extends Error {
  constructor(public readonly taskCount: number) {
    super(
      taskCount === 1
        ? "This column still has 1 task. Move or delete it first."
        : `This column still has ${taskCount} tasks. Move or delete them first.`,
    );
    this.name = "BoardNotEmptyError";
  }
}

/** Create a board (column). Returns the new row so the cache can add it. */
export async function createBoard(
  sb: SupabaseClient,
  input: BoardInput,
): Promise<Board> {
  const parsed = parseInput(boardInputSchema, input);
  const { data, error } = await sb
    .from("boards")
    .insert(boardInputToRow(parsed))
    .select()
    .single();
  if (error) throw error;
  return mapBoard(data);
}

export async function updateBoard(
  sb: SupabaseClient,
  id: string,
  patch: Partial<BoardInput>,
): Promise<void> {
  const parsed = parseInput(boardPatchSchema, patch);
  const row = boardPatchToRow(parsed);
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("boards").update(row).eq("id", id);
  if (error) throw error;
}

/** Persist a new column order (id -> position). */
export async function reorderBoards(
  sb: SupabaseClient,
  positions: { id: string; position: number }[],
): Promise<void> {
  await Promise.all(
    positions.map(({ id, position }) =>
      sb
        .from("boards")
        .update({ position })
        .eq("id", id)
        .then(({ error }) => {
          if (error) throw error;
        }),
    ),
  );
}

/**
 * Delete a board, but only when it holds no tasks (block-if-non-empty). Throws
 * `BoardNotEmptyError` otherwise. Returns the deleted row for undo.
 */
export async function deleteBoard(
  sb: SupabaseClient,
  id: string,
): Promise<Record<string, unknown>> {
  const { count, error: cntErr } = await sb
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("board_id", id);
  if (cntErr) throw cntErr;
  if (count && count > 0) throw new BoardNotEmptyError(count);

  const { data: board, error: selErr } = await sb
    .from("boards")
    .select("*")
    .eq("id", id)
    .single();
  if (selErr) throw selErr;

  const { error } = await sb.from("boards").delete().eq("id", id);
  if (error) throw error;
  return board as Record<string, unknown>;
}

/** Re-insert a deleted board (undo). */
export async function restoreBoard(
  sb: SupabaseClient,
  board: Record<string, unknown>,
): Promise<void> {
  const { error } = await sb.from("boards").insert(board);
  if (error) throw error;
}

// --- Checkpoints (flow milestones) -----------------------------------------

/** Create a flow checkpoint. Returns the new row so the cache can add it. */
export async function createCheckpoint(
  sb: SupabaseClient,
  input: CheckpointInput,
): Promise<TaskCheckpoint> {
  const parsed = parseInput(checkpointInputSchema, input);
  const { data, error } = await sb
    .from("task_checkpoints")
    .insert(checkpointInputToRow(parsed))
    .select()
    .single();
  if (error) throw error;
  return mapCheckpoint(data);
}

/** Update a checkpoint; returns the full row so trigger-normalized fields land. */
export async function updateCheckpoint(
  sb: SupabaseClient,
  id: string,
  patch: Partial<CheckpointInput>,
): Promise<TaskCheckpoint> {
  const parsed = parseInput(checkpointPatchSchema, patch);
  const { data, error } = await sb
    .from("task_checkpoints")
    .update(checkpointPatchToRow(parsed))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapCheckpoint(data);
}

/** Delete a checkpoint, returning the raw row so the delete is undoable. */
export async function deleteCheckpoint(
  sb: SupabaseClient,
  id: string,
): Promise<Record<string, unknown>> {
  const { data, error: selErr } = await sb
    .from("task_checkpoints")
    .select("*")
    .eq("id", id)
    .single();
  if (selErr) throw selErr;
  const { error } = await sb.from("task_checkpoints").delete().eq("id", id);
  if (error) throw error;
  return data as Record<string, unknown>;
}

/** Re-insert a deleted checkpoint (undo). */
export async function restoreCheckpoint(
  sb: SupabaseClient,
  checkpoint: Record<string, unknown>,
): Promise<void> {
  const { error } = await sb.from("task_checkpoints").insert(checkpoint);
  if (error) throw error;
}

// --- Member preferences ----------------------------------------------------

export interface MemberPreferencesPatch {
  /** UI language. Mirrors the DB CHECK ('en' | 'ru'). */
  locale?: AppLocale;
  themePreference?: ThemePreference;
  accent?: AccentId;
  surfaceTone?: SurfaceTone;
  palette?: Palette;
  /** The `pink` palette's base hue (`#rrggbb`), or null to use the default pink. */
  pinkBase?: string | null;
  /** IANA zone, or null to clear it (= follow the device). */
  timezone?: string | null;
  /** IANA zone, or null to turn the secondary zone off. */
  secondaryTimezone?: string | null;
  /** Whether inactive events are shown in the month view. */
  showInactiveInMonth?: boolean;
  /** Whether success/confirmation toasts are shown (errors always are). */
  showSuccessToasts?: boolean;
  /** How context time-blocks are labelled in the week/day grid. */
  contextLabel?: ContextLabel;
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
  if (patch.locale != null) row.locale = patch.locale;
  if (patch.themePreference != null) row.theme_preference = patch.themePreference;
  if (patch.accent != null) row.accent = patch.accent;
  if (patch.surfaceTone != null) row.surface_tone = patch.surfaceTone;
  if (patch.palette != null) row.palette = patch.palette;
  // `pinkBase` is nullable (explicit null = use the default pink), so key on presence.
  if ("pinkBase" in patch) row.pink_base = patch.pinkBase ?? null;
  // `timezone`/`secondaryTimezone` are nullable: an explicit null clears the
  // column (= follow device / turn secondary off), so key on presence, not value.
  if ("timezone" in patch) row.timezone = patch.timezone ?? null;
  if ("secondaryTimezone" in patch) row.secondary_timezone = patch.secondaryTimezone ?? null;
  if (patch.showInactiveInMonth != null) row.show_inactive_in_month = patch.showInactiveInMonth;
  if (patch.showSuccessToasts != null) row.show_success_toasts = patch.showSuccessToasts;
  if (patch.contextLabel != null) row.context_label = patch.contextLabel;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("members").update(row).eq("id", memberId);
  if (error) throw error;
}

// --- Sleep logs --------------------------------------------------------------

/**
 * Insert or replace the viewer's log for one night (unique member_id,date —
 * the morning check-in and a backfill edit of the same date both land here).
 * RLS keeps it member-private.
 */
export async function upsertSleepLog(
  sb: SupabaseClient,
  input: SleepLogInput,
): Promise<SleepLog> {
  const { data, error } = await sb
    .from("sleep_logs")
    .upsert(sleepLogInputToRow(input), { onConflict: "member_id,date" })
    .select()
    .single();
  if (error) throw error;
  return mapSleepLog(data);
}

/**
 * Insert or update the signed-in member's sleep PREFERENCES (member-private,
 * one row per member). A partial input upserts only the touched columns; on
 * first save the rest default at the DB. RLS scopes it to their own row.
 */
export async function upsertMemberSleepPrefs(
  sb: SupabaseClient,
  input: MemberSleepPrefsInput,
): Promise<MemberSleepPrefs> {
  const { data, error } = await sb
    .from("member_sleep_prefs")
    .upsert(memberSleepPrefsInputToRow(input), { onConflict: "member_id" })
    .select()
    .single();
  if (error) throw error;
  return mapMemberSleepPrefs(data);
}

/** Remove the viewer's log for one night. RLS limits it to their own rows. */
export async function deleteSleepLog(
  sb: SupabaseClient,
  memberId: string,
  date: string,
): Promise<void> {
  const { error } = await sb
    .from("sleep_logs")
    .delete()
    .eq("member_id", memberId)
    .eq("date", date);
  if (error) throw error;
}

// --- Insights customization --------------------------------------------------

/** Create or replace the workspace's goal for one category. */
export async function upsertCategoryGoal(
  sb: SupabaseClient,
  input: CategoryGoalInput,
): Promise<CategoryGoal> {
  const { data, error } = await sb
    .from("category_goals")
    .upsert(categoryGoalInputToRow(input), { onConflict: "workspace_id,category_id" })
    .select()
    .single();
  if (error) throw error;
  return mapCategoryGoal(data);
}

export async function deleteCategoryGoal(
  sb: SupabaseClient,
  goalId: string,
): Promise<void> {
  const { error } = await sb.from("category_goals").delete().eq("id", goalId);
  if (error) throw error;
}

export async function createInsightsView(
  sb: SupabaseClient,
  input: InsightsViewInput,
): Promise<InsightsView> {
  const { data, error } = await sb
    .from("insights_views")
    .insert(insightsViewInputToRow(input))
    .select()
    .single();
  if (error) throw error;
  return mapInsightsView(data);
}

export async function deleteInsightsView(
  sb: SupabaseClient,
  viewId: string,
): Promise<void> {
  const { error } = await sb.from("insights_views").delete().eq("id", viewId);
  if (error) throw error;
}

/**
 * Merge a partial prefs change into the member's single row (insert-or-update
 * on the member_id PK). Only the provided fields change; `updated_at` bumps so
 * other devices' realtime invalidation sees a row change even when the jsonb
 * is structurally similar.
 */
export async function upsertInsightsPrefs(
  sb: SupabaseClient,
  workspaceId: string,
  memberId: string,
  patch: Partial<Pick<InsightsPrefs, "dashboard" | "suppressedKinds">>,
): Promise<InsightsPrefs> {
  const row: Record<string, unknown> = {
    member_id: memberId,
    workspace_id: workspaceId,
    updated_at: new Date().toISOString(),
  };
  if (patch.dashboard !== undefined) row.dashboard = patch.dashboard;
  if (patch.suppressedKinds !== undefined)
    row.suppressed_kinds = patch.suppressedKinds;
  const { data, error } = await sb
    .from("insights_prefs")
    .upsert(row, { onConflict: "member_id" })
    .select()
    .single();
  if (error) throw error;
  return mapInsightsPrefs(data);
}

// --- Tasks -----------------------------------------------------------------

export async function createTask(
  sb: SupabaseClient,
  input: TaskInput,
): Promise<TaskRow> {
  const { data, error } = await sb
    .from("tasks")
    .insert(taskInputToRow(parseInput(taskInputSchema, input)))
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
  let q = sb
    .from("tasks")
    .update(taskPatchToRow(parseInput(taskPatchSchema, patch)))
    .eq("id", id);
  if (expectedUpdatedAt != null) q = guardUpdatedAt(q, expectedUpdatedAt);
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
 * Transfer ownership of a task — and its whole subtree — to another workspace
 * member. Subtasks inherit their parent's owner at creation, so the entire
 * subtree moves together to keep ownership and visibility coherent. Only rows
 * the caller currently owns are reassigned (RLS filters the rest), and a private
 * task drops out of the caller's view once it belongs to the new owner.
 */
export async function transferTaskOwnership(
  sb: SupabaseClient,
  id: string,
  newOwnerId: string,
): Promise<void> {
  // BFS the subtree so arbitrary nesting depth moves with the root.
  const ids = [id];
  let frontier = [id];
  while (frontier.length > 0) {
    const { data: children, error } = await sb
      .from("tasks")
      .select("id")
      .in("parent_id", frontier);
    if (error) throw error;
    if (!children || children.length === 0) break;
    const childIds = children.map((c) => c.id as string);
    ids.push(...childIds);
    frontier = childIds;
  }
  const { error } = await sb.from("tasks").update({ owner_id: newOwnerId }).in("id", ids);
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
      // Blocks inherit the task's optimization attributes, so energy/focus
      // set on a task flows onto its scheduled time.
      attributes: task.attributes,
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
      attributes: it.task.attributes,
    }),
  );
  const { data, error } = await sb.from("events").insert(rows).select();
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}
