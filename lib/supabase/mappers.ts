// Map Postgres rows (snake_case, timestamptz strings) <-> app domain
// (camelCase, epoch ms). Keep all conversion in one place.

import type {
  EventRow,
  OverrideRow,
  Member,
  Category,
  TaskRow,
  ThemePreference,
  AccentId,
  SurfaceTone,
} from "@/lib/types";

type Row = Record<string, unknown>;

const toMs = (t: unknown): number => new Date(t as string).getTime();
const toMsOrNull = (t: unknown): number | null =>
  t == null ? null : new Date(t as string).getTime();
const toIso = (ms: number): string => new Date(ms).toISOString();
const toIsoOrNull = (ms: number | null | undefined): string | null =>
  ms == null ? null : new Date(ms).toISOString();

export function mapMember(r: Row): Member {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    authUserId: (r.auth_user_id as string | null) ?? null,
    name: r.name as string,
    color: r.color as string,
    hasPin: r.pin_hash != null,
    themePreference: (r.theme_preference as ThemePreference | null) ?? "system",
    accent: (r.accent as AccentId | null) ?? "terracotta",
    surfaceTone: (r.surface_tone as SurfaceTone | null) ?? "warm",
  };
}

export function mapCategory(r: Row): Category {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    ownerId: (r.owner_id as string | null) ?? null,
    name: r.name as string,
    color: r.color as string,
    sortOrder: (r.sort_order as number) ?? 0,
  };
}

export function mapEvent(r: Row): EventRow {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    ownerId: r.owner_id as string,
    categoryId: (r.category_id as string | null) ?? null,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    isPrivate: Boolean(r.is_private),
    color: (r.color as string | null) ?? null,
    kind: (r.kind as EventRow["kind"] | null) ?? "event",
    contextId: (r.context_id as string | null) ?? null,
    allDay: Boolean(r.all_day),
    start: toMs(r.starts_at),
    end: toMs(r.ends_at),
    timeZone: r.time_zone as string,
    rrule: (r.rrule as string | null) ?? null,
    recurrenceEndsAt: toMsOrNull(r.recurrence_ends_at),
    taskId: (r.task_id as string | null) ?? null,
    createdAt: toMs(r.created_at),
    updatedAt: toMs(r.updated_at),
  };
}

export function mapTask(r: Row): TaskRow {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    ownerId: r.owner_id as string,
    assigneeId: (r.assignee_id as string | null) ?? null,
    parentId: (r.parent_id as string | null) ?? null,
    categoryId: (r.category_id as string | null) ?? null,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    isPrivate: Boolean(r.is_private),
    color: (r.color as string | null) ?? null,
    status: r.status as TaskRow["status"],
    priority: (r.priority as number | null) ?? null,
    dueAt: toMsOrNull(r.due_at),
    position: (r.position as number) ?? 0,
    sequential: Boolean(r.sequential),
    completedAt: toMsOrNull(r.completed_at),
    createdAt: toMs(r.created_at),
    updatedAt: toMs(r.updated_at),
  };
}

export function mapOverride(r: Row): OverrideRow {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    eventId: r.event_id as string,
    occurrenceDate: toMs(r.occurrence_date),
    type: r.type as OverrideRow["type"],
    title: (r.title as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    categoryId: (r.category_id as string | null) ?? null,
    start: toMsOrNull(r.starts_at),
    end: toMsOrNull(r.ends_at),
    allDay: r.all_day == null ? null : Boolean(r.all_day),
  };
}

/** Fields accepted when creating/updating an event (domain shape, ms times). */
export interface EventInput {
  workspaceId: string;
  ownerId: string;
  categoryId?: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  isPrivate?: boolean;
  color?: string | null;
  kind?: EventRow["kind"];
  contextId?: string | null;
  allDay?: boolean;
  start: number;
  end: number;
  timeZone: string;
  rrule?: string | null;
  recurrenceEndsAt?: number | null;
  taskId?: string | null;
}

export function eventInputToRow(input: EventInput): Row {
  return {
    workspace_id: input.workspaceId,
    owner_id: input.ownerId,
    category_id: input.categoryId ?? null,
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    is_private: input.isPrivate ?? false,
    color: input.color ?? null,
    kind: input.kind ?? "event",
    context_id: input.contextId ?? null,
    all_day: input.allDay ?? false,
    starts_at: toIso(input.start),
    ends_at: toIso(input.end),
    time_zone: input.timeZone,
    rrule: input.rrule ?? null,
    recurrence_ends_at: toIsoOrNull(input.recurrenceEndsAt ?? null),
    task_id: input.taskId ?? null,
  };
}

/** Partial event patch (ms times) -> snake_case row patch for UPDATE. */
export function eventPatchToRow(patch: Partial<EventInput>): Row {
  const row: Row = {};
  if ("categoryId" in patch) row.category_id = patch.categoryId ?? null;
  if ("title" in patch) row.title = patch.title;
  if ("description" in patch) row.description = patch.description ?? null;
  if ("location" in patch) row.location = patch.location ?? null;
  if ("isPrivate" in patch) row.is_private = patch.isPrivate ?? false;
  if ("color" in patch) row.color = patch.color ?? null;
  if ("kind" in patch) row.kind = patch.kind;
  if ("contextId" in patch) row.context_id = patch.contextId ?? null;
  if ("allDay" in patch) row.all_day = patch.allDay;
  if ("start" in patch && patch.start != null) row.starts_at = toIso(patch.start);
  if ("end" in patch && patch.end != null) row.ends_at = toIso(patch.end);
  if ("timeZone" in patch) row.time_zone = patch.timeZone;
  if ("rrule" in patch) row.rrule = patch.rrule ?? null;
  if ("recurrenceEndsAt" in patch)
    row.recurrence_ends_at = toIsoOrNull(patch.recurrenceEndsAt ?? null);
  if ("taskId" in patch) row.task_id = patch.taskId ?? null;
  return row;
}

// --- Tasks -----------------------------------------------------------------

/** Fields accepted when creating a task (domain shape, ms times). */
export interface TaskInput {
  workspaceId: string;
  ownerId: string;
  assigneeId?: string | null;
  parentId?: string | null;
  categoryId?: string | null;
  title: string;
  description?: string | null;
  isPrivate?: boolean;
  color?: string | null;
  status?: TaskRow["status"];
  priority?: number | null;
  dueAt?: number | null;
  position?: number;
  sequential?: boolean;
  completedAt?: number | null;
}

export function taskInputToRow(input: TaskInput): Row {
  return {
    workspace_id: input.workspaceId,
    owner_id: input.ownerId,
    assignee_id: input.assigneeId ?? null,
    parent_id: input.parentId ?? null,
    category_id: input.categoryId ?? null,
    title: input.title,
    description: input.description ?? null,
    is_private: input.isPrivate ?? false,
    color: input.color ?? null,
    status: input.status ?? "todo",
    priority: input.priority ?? null,
    due_at: toIsoOrNull(input.dueAt ?? null),
    position: input.position ?? 0,
    sequential: input.sequential ?? false,
    completed_at: toIsoOrNull(input.completedAt ?? null),
  };
}

/** Partial task patch (ms times) -> snake_case row patch for UPDATE. */
export function taskPatchToRow(patch: Partial<TaskInput>): Row {
  const row: Row = {};
  if ("assigneeId" in patch) row.assignee_id = patch.assigneeId ?? null;
  if ("parentId" in patch) row.parent_id = patch.parentId ?? null;
  if ("categoryId" in patch) row.category_id = patch.categoryId ?? null;
  if ("title" in patch) row.title = patch.title;
  if ("description" in patch) row.description = patch.description ?? null;
  if ("isPrivate" in patch) row.is_private = patch.isPrivate ?? false;
  if ("color" in patch) row.color = patch.color ?? null;
  if ("status" in patch) row.status = patch.status;
  if ("priority" in patch) row.priority = patch.priority ?? null;
  if ("dueAt" in patch) row.due_at = toIsoOrNull(patch.dueAt ?? null);
  if ("position" in patch) row.position = patch.position;
  if ("sequential" in patch) row.sequential = patch.sequential;
  if ("completedAt" in patch) row.completed_at = toIsoOrNull(patch.completedAt ?? null);
  return row;
}
