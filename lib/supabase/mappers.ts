// Map Postgres rows (snake_case, timestamptz strings) <-> app domain
// (camelCase, epoch ms). Keep all conversion in one place.

import { parseAttributes, type ItemAttributes } from "@/lib/attributes/schema";
import { asFlowLineStyle } from "@/lib/tasks/flow-line-styles";
import type {
  EventRow,
  EventStatus,
  OverrideRow,
  Member,
  Category,
  CategoryGoal,
  InsightsPrefs,
  InsightsView,
  Board,
  SleepLog,
  TaskRow,
  TaskStatusEvent,
  AppLocale,
  ThemePreference,
  AccentId,
  SurfaceTone,
  Palette,
  ContextLabel,
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
    locale: (r.locale as AppLocale | null) ?? "en",
    themePreference: (r.theme_preference as ThemePreference | null) ?? "system",
    accent: (r.accent as AccentId | null) ?? "peach",
    surfaceTone: (r.surface_tone as SurfaceTone | null) ?? "warm",
    palette: (r.palette as Palette | null) ?? "default",
    timezone: (r.timezone as string | null) ?? null,
    secondaryTimezone: (r.secondary_timezone as string | null) ?? null,
    showInactiveInMonth:
      r.show_inactive_in_month == null ? true : Boolean(r.show_inactive_in_month),
    showSuccessToasts:
      r.show_success_toasts == null ? true : Boolean(r.show_success_toasts),
    contextLabel: (r.context_label as ContextLabel | null) ?? "bar",
    sleepCycleLengthMin: (r.sleep_cycle_length_min as number | null) ?? 90,
    sleepOnsetLatencyMin: (r.sleep_onset_latency_min as number | null) ?? 15,
    targetSleepCycles: (r.target_sleep_cycles as number | null) ?? 5,
    sleepCategoryId: (r.sleep_category_id as string | null) ?? null,
    nightWindowStartHour: (r.night_window_start_hour as number | null) ?? 20,
    nightWindowEndHour: (r.night_window_end_hour as number | null) ?? 12,
  };
}

export function mapSleepLog(r: Row): SleepLog {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    memberId: r.member_id as string,
    date: r.date as string, // zone-free yyyy-mm-dd wake-date token, verbatim
    bedtimeAt: toMsOrNull(r.bedtime_at),
    wokeAt: toMsOrNull(r.woke_at),
    quality: (r.quality as number | null) ?? null,
    fatigue: (r.fatigue as number | null) ?? null,
    note: (r.note as string | null) ?? null,
    createdAt: toMs(r.created_at),
  };
}

/** Upsert payload for one night (conflict key member_id,date). */
export interface SleepLogInput {
  workspaceId: string;
  memberId: string;
  /** WAKE date "yyyy-MM-dd" in the viewer's zone */
  date: string;
  bedtimeAt?: number | null;
  wokeAt?: number | null;
  quality?: number | null;
  fatigue?: number | null;
  note?: string | null;
}

export function sleepLogInputToRow(input: SleepLogInput): Row {
  return {
    workspace_id: input.workspaceId,
    member_id: input.memberId,
    date: input.date,
    bedtime_at: toIsoOrNull(input.bedtimeAt ?? null),
    woke_at: toIsoOrNull(input.wokeAt ?? null),
    quality: input.quality ?? null,
    fatigue: input.fatigue ?? null,
    note: input.note ?? null,
  };
}

export function mapCategoryGoal(r: Row): CategoryGoal {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    categoryId: r.category_id as string,
    weeklyTargetMs: Number(r.weekly_target_ms), // bigint may arrive as string
    direction: (r.direction as CategoryGoal["direction"] | null) ?? "at-least",
    createdBy: r.created_by as string,
    createdAt: toMs(r.created_at),
  };
}

/** Upsert payload for one goal (conflict key workspace_id,category_id). */
export interface CategoryGoalInput {
  workspaceId: string;
  categoryId: string;
  /** weekly target/budget, ms (DB CHECK: 15 min .. 7 days) */
  weeklyTargetMs: number;
  direction?: CategoryGoal["direction"];
  createdBy: string;
}

export function categoryGoalInputToRow(input: CategoryGoalInput): Row {
  return {
    workspace_id: input.workspaceId,
    category_id: input.categoryId,
    weekly_target_ms: input.weeklyTargetMs,
    direction: input.direction ?? "at-least",
    created_by: input.createdBy,
  };
}

export function mapInsightsView(r: Row): InsightsView {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    memberId: r.member_id as string,
    name: r.name as string,
    config: r.config, // raw jsonb; lib/insights/views.ts validates on read
    position: (r.position as number) ?? 0,
    createdAt: toMs(r.created_at),
  };
}

/** Insert payload for a saved view. */
export interface InsightsViewInput {
  workspaceId: string;
  memberId: string;
  name: string;
  /** encodeViewConfig output (or any JSON-safe bag; validated on read) */
  config: unknown;
  position?: number;
}

export function insightsViewInputToRow(input: InsightsViewInput): Row {
  return {
    workspace_id: input.workspaceId,
    member_id: input.memberId,
    name: input.name,
    config: input.config,
    position: input.position ?? 0,
  };
}

/** Lenient read of the prefs `dashboard` jsonb: junk degrades to {}. */
function mapDashboard(value: unknown): InsightsPrefs["dashboard"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>;
  const strings = (x: unknown): string[] | undefined =>
    Array.isArray(x)
      ? x.filter((s): s is string => typeof s === "string")
      : undefined;
  const out: InsightsPrefs["dashboard"] = {};
  const order = strings(v.order);
  const hidden = strings(v.hidden);
  if (order) out.order = order;
  if (hidden) out.hidden = hidden;
  return out;
}

export function mapInsightsPrefs(r: Row): InsightsPrefs {
  return {
    memberId: r.member_id as string,
    workspaceId: r.workspace_id as string,
    dashboard: mapDashboard(r.dashboard),
    suppressedKinds: Array.isArray(r.suppressed_kinds)
      ? (r.suppressed_kinds as unknown[]).filter(
          (s): s is string => typeof s === "string",
        )
      : [],
    updatedAt: toMs(r.updated_at),
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

export function mapBoard(r: Row): Board {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    ownerId: (r.owner_id as string | null) ?? null,
    name: r.name as string,
    color: r.color as string,
    lineStyle: asFlowLineStyle(r.line_style as string | null),
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
    isShared: Boolean(r.is_shared),
    color: (r.color as string | null) ?? null,
    kind: (r.kind as EventRow["kind"] | null) ?? "event",
    allDay: Boolean(r.all_day),
    inactive: Boolean(r.inactive),
    status: (r.status as EventStatus | null) ?? "confirmed",
    start: toMs(r.starts_at),
    end: toMs(r.ends_at),
    timeZone: r.time_zone as string,
    rrule: (r.rrule as string | null) ?? null,
    recurrenceEndsAt: toMsOrNull(r.recurrence_ends_at),
    taskId: (r.task_id as string | null) ?? null,
    attributes: parseAttributes(r.attributes),
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
    boardId: (r.board_id as string | null) ?? null,
    categoryId: (r.category_id as string | null) ?? null,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    isPrivate: Boolean(r.is_private),
    color: (r.color as string | null) ?? null,
    status: r.status as TaskRow["status"],
    priority: (r.priority as number | null) ?? null,
    dueDate: (r.due_date as string | null) ?? null,
    startDate: (r.start_date as string | null) ?? null,
    isMilestone: Boolean(r.is_milestone),
    position: (r.position as number) ?? 0,
    sequential: Boolean(r.sequential),
    completedAt: toMsOrNull(r.completed_at),
    attributes: parseAttributes(r.attributes),
    createdAt: toMs(r.created_at),
    updatedAt: toMs(r.updated_at),
  };
}

export function mapStatusEvent(r: Row): TaskStatusEvent {
  return {
    id: r.id as string,
    taskId: r.task_id as string,
    workspaceId: r.workspace_id as string,
    fromStatus: (r.from_status as TaskStatusEvent["fromStatus"]) ?? null,
    toStatus: r.to_status as TaskStatusEvent["toStatus"],
    changedBy: (r.changed_by as string | null) ?? null,
    changedAt: toMs(r.changed_at),
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
  isShared?: boolean;
  color?: string | null;
  kind?: EventRow["kind"];
  allDay?: boolean;
  inactive?: boolean;
  status?: EventStatus;
  start: number;
  end: number;
  timeZone: string;
  rrule?: string | null;
  recurrenceEndsAt?: number | null;
  taskId?: string | null;
  /** whole-object write; callers start from the parsed full bag so unknown keys survive */
  attributes?: ItemAttributes;
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
    is_shared: input.isShared ?? false,
    color: input.color ?? null,
    kind: input.kind ?? "event",
    all_day: input.allDay ?? false,
    inactive: input.inactive ?? false,
    status: input.status ?? "confirmed",
    starts_at: toIso(input.start),
    ends_at: toIso(input.end),
    time_zone: input.timeZone,
    rrule: input.rrule ?? null,
    recurrence_ends_at: toIsoOrNull(input.recurrenceEndsAt ?? null),
    task_id: input.taskId ?? null,
    attributes: input.attributes ?? {},
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
  if ("isShared" in patch) row.is_shared = patch.isShared ?? false;
  if ("color" in patch) row.color = patch.color ?? null;
  if ("kind" in patch) row.kind = patch.kind;
  if ("allDay" in patch) row.all_day = patch.allDay;
  if ("inactive" in patch) row.inactive = patch.inactive;
  if ("status" in patch) row.status = patch.status;
  if ("start" in patch && patch.start != null) row.starts_at = toIso(patch.start);
  if ("end" in patch && patch.end != null) row.ends_at = toIso(patch.end);
  if ("timeZone" in patch) row.time_zone = patch.timeZone;
  if ("rrule" in patch) row.rrule = patch.rrule ?? null;
  if ("recurrenceEndsAt" in patch)
    row.recurrence_ends_at = toIsoOrNull(patch.recurrenceEndsAt ?? null);
  if ("taskId" in patch) row.task_id = patch.taskId ?? null;
  if ("attributes" in patch) row.attributes = patch.attributes ?? {};
  return row;
}

// --- Tasks -----------------------------------------------------------------

/** Fields accepted when creating a task (domain shape, ms times). */
export interface TaskInput {
  workspaceId: string;
  ownerId: string;
  assigneeId?: string | null;
  parentId?: string | null;
  boardId?: string | null;
  categoryId?: string | null;
  title: string;
  description?: string | null;
  isPrivate?: boolean;
  color?: string | null;
  status?: TaskRow["status"];
  priority?: number | null;
  /** zone-free calendar date ("yyyy-MM-dd") */
  dueDate?: string | null;
  /** zone-free planned start date ("yyyy-MM-dd"); null = anchor to creation */
  startDate?: string | null;
  /** point-in-time task: Flows renders a moment marker, not a span */
  isMilestone?: boolean;
  position?: number;
  sequential?: boolean;
  completedAt?: number | null;
  /** whole-object write; callers start from the parsed full bag so unknown keys survive */
  attributes?: ItemAttributes;
}

export function taskInputToRow(input: TaskInput): Row {
  return {
    workspace_id: input.workspaceId,
    owner_id: input.ownerId,
    assignee_id: input.assigneeId ?? null,
    parent_id: input.parentId ?? null,
    board_id: input.boardId ?? null,
    category_id: input.categoryId ?? null,
    title: input.title,
    description: input.description ?? null,
    is_private: input.isPrivate ?? false,
    color: input.color ?? null,
    status: input.status ?? "todo",
    priority: input.priority ?? null,
    due_date: input.dueDate ?? null,
    start_date: input.startDate ?? null,
    is_milestone: input.isMilestone ?? false,
    position: input.position ?? 0,
    sequential: input.sequential ?? false,
    completed_at: toIsoOrNull(input.completedAt ?? null),
    attributes: input.attributes ?? {},
  };
}

/** Partial task patch (ms times) -> snake_case row patch for UPDATE. */
export function taskPatchToRow(patch: Partial<TaskInput>): Row {
  const row: Row = {};
  if ("assigneeId" in patch) row.assignee_id = patch.assigneeId ?? null;
  if ("parentId" in patch) row.parent_id = patch.parentId ?? null;
  if ("boardId" in patch) row.board_id = patch.boardId ?? null;
  if ("categoryId" in patch) row.category_id = patch.categoryId ?? null;
  if ("title" in patch) row.title = patch.title;
  if ("description" in patch) row.description = patch.description ?? null;
  if ("isPrivate" in patch) row.is_private = patch.isPrivate ?? false;
  if ("color" in patch) row.color = patch.color ?? null;
  if ("status" in patch) row.status = patch.status;
  if ("priority" in patch) row.priority = patch.priority ?? null;
  if ("dueDate" in patch) row.due_date = patch.dueDate ?? null;
  if ("startDate" in patch) row.start_date = patch.startDate ?? null;
  if ("isMilestone" in patch) row.is_milestone = patch.isMilestone ?? false;
  if ("position" in patch) row.position = patch.position;
  if ("sequential" in patch) row.sequential = patch.sequential;
  if ("completedAt" in patch) row.completed_at = toIsoOrNull(patch.completedAt ?? null);
  if ("attributes" in patch) row.attributes = patch.attributes ?? {};
  return row;
}
