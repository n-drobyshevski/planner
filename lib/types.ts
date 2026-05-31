// Shared domain types. Times are epoch milliseconds (UTC) inside the app;
// the data layer converts to/from Postgres `timestamptz` at the boundary.

export type Scope = "shared" | "personal";
export type Visibility = "private" | "shared";
export type OverrideType = "cancel" | "modify";
export type TaskStatus = "todo" | "in_progress" | "done";

export interface Member {
  id: string;
  workspaceId: string;
  authUserId: string | null;
  name: string;
  color: string; // hex accent
  hasPin: boolean;
}

export interface Category {
  id: string;
  workspaceId: string;
  ownerId: string | null; // null = shared category
  name: string;
  color: string; // hex
  sortOrder: number;
}

export interface EventRow {
  id: string;
  workspaceId: string;
  ownerId: string;
  categoryId: string | null;
  title: string;
  description: string | null;
  location: string | null;
  scope: Scope;
  visibility: Visibility;
  allDay: boolean;
  /** master / first-occurrence start, epoch ms */
  start: number;
  /** master / first-occurrence end, epoch ms */
  end: number;
  /** IANA time zone, for DST-correct recurrence expansion */
  timeZone: string;
  /** RFC5545 RRULE string (no DTSTART line); null = single event */
  rrule: string | null;
  /** denormalized last-occurrence end (ms) for window pruning; null = open-ended */
  recurrenceEndsAt: number | null;
  /** when set, this event is a scheduled block of a task ("part" of it) */
  taskId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TaskRow {
  id: string;
  workspaceId: string;
  ownerId: string; // creator; drives edit rights
  assigneeId: string | null; // responsible member; null = unassigned
  parentId: string | null; // subtask -> parent; null = top-level
  categoryId: string | null;
  title: string;
  description: string | null;
  scope: Scope;
  visibility: Visibility;
  status: TaskStatus;
  /** 0..3 priority; null = none */
  priority: number | null;
  /** optional deadline, epoch ms */
  dueAt: number | null;
  /** order within its status column / among siblings */
  position: number;
  /** parent only: subtasks must be completed in order */
  sequential: boolean;
  /** set when status -> done, epoch ms */
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface OverrideRow {
  id: string;
  workspaceId: string;
  eventId: string;
  /** ORIGINAL occurrence start (ms) — the stable key */
  occurrenceDate: number;
  type: OverrideType;
  title: string | null;
  description: string | null;
  location: string | null;
  categoryId: string | null;
  start: number | null;
  end: number | null;
  allDay: boolean | null;
}

/** A concrete, displayable instance produced by expanding events over a window. */
export interface Occurrence {
  /** stable id: `${eventId}:${occurrenceDate}` */
  key: string;
  eventId: string;
  occurrenceDate: number; // original occurrence start (override key)
  start: number;
  end: number;
  allDay: boolean;
  title: string;
  description: string | null;
  location: string | null;
  categoryId: string | null;
  ownerId: string;
  scope: Scope;
  visibility: Visibility;
  /** when set, this occurrence is a scheduled block of a task */
  taskId: string | null;
  isRecurring: boolean;
  /** true when a `modify` override was applied to this instance */
  isException: boolean;
}

export type CalendarView = "month" | "week" | "day";

/** Half-open time window [start, end) in epoch ms. */
export interface TimeWindow {
  start: number;
  end: number;
}
