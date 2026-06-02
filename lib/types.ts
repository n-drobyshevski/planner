// Shared domain types. Times are epoch milliseconds (UTC) inside the app;
// the data layer converts to/from Postgres `timestamptz` at the boundary.

export type OverrideType = "cancel" | "modify";
export type TaskStatus = "todo" | "in_progress" | "done";
/** An event's lifecycle state, driving how it renders on the calendar:
 *  'cancelled' (diagonal grayed stripes), 'planned' (dotted outline), or
 *  'confirmed' (plain fill, the default). */
export type EventStatus = "cancelled" | "planned" | "confirmed";
/** A normal calendar event vs. a "context" — a Context's time-block on the
 *  calendar (a backdrop painting the category in `categoryId`). */
export type EventKind = "event" | "context";

/** Appearance preferences, stored per member. Mirror the DB CHECK constraints. */
export type ThemePreference = "light" | "dark" | "system";
/** The 14 Catppuccin accent colors. Each has a default-(warm)-palette hex plus a
 *  value per Catppuccin flavor (see the --swatch-* / [data-accent] CSS). */
export type AccentId =
  | "rosewater"
  | "flamingo"
  | "pink"
  | "mauve"
  | "red"
  | "maroon"
  | "peach"
  | "yellow"
  | "green"
  | "teal"
  | "sky"
  | "sapphire"
  | "blue"
  | "lavender";
export type SurfaceTone = "warm" | "neutral" | "cool";
/**
 * Full-palette theme. `default` keeps the native warm system (light/dark +
 * accent + tone); the Catppuccin flavors override the entire palette and own
 * their own light/dark mode (Latte is light, the rest are dark).
 */
export type Palette =
  | "default"
  | "catppuccin-latte"
  | "catppuccin-frappe"
  | "catppuccin-macchiato"
  | "catppuccin-mocha";

export interface Member {
  id: string;
  workspaceId: string;
  authUserId: string | null;
  name: string;
  color: string; // hex accent
  hasPin: boolean;
  // Appearance preferences (per member).
  themePreference: ThemePreference;
  accent: AccentId;
  surfaceTone: SurfaceTone;
  palette: Palette;
  // Time-zone preferences (per member). `timezone` null = follow the device;
  // `secondaryTimezone` null = no secondary zone shown. Both are IANA names.
  timezone: string | null;
  secondaryTimezone: string | null;
  // When false, inactive (grayed-out) events are hidden in the cramped month
  // view; they always show in the denser week/day grids. Defaults to true.
  showInactiveInMonth: boolean;
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
  /** true = only the owner can see it; false (default) = shared with the workspace */
  isPrivate: boolean;
  /** per-item color override (hex); null = derive from category/owner */
  color: string | null;
  /** 'event' (normal) or 'context' (a Context's time-block on the calendar).
   *  A context block paints the category named by `categoryId`. */
  kind: EventKind;
  allDay: boolean;
  /** when true, the event is de-emphasized (grayed out) in the calendar, e.g. sleep hours */
  inactive: boolean;
  /** lifecycle state; series-level, drives the calendar rendering (default 'confirmed') */
  status: EventStatus;
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
  /** true = only the owner can see it; false (default) = shared with the workspace */
  isPrivate: boolean;
  /** per-item color override (hex); null = derive from category/owner */
  color: string | null;
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
  /** inherited from the event: when true, render this occurrence grayed out */
  inactive: boolean;
  /** inherited from the event: lifecycle state driving the calendar rendering */
  status: EventStatus;
  title: string;
  description: string | null;
  location: string | null;
  categoryId: string | null;
  /** per-item color override (hex), carried from the master event; null = derived */
  color: string | null;
  /** 'event' (normal) or 'context' (a Context's time-block on the calendar). */
  kind: EventKind;
  ownerId: string;
  /** true = only the owner can see it; false (default) = shared */
  isPrivate: boolean;
  /** when set, this occurrence is a scheduled block of a task */
  taskId: string | null;
  isRecurring: boolean;
  /** true when a `modify` override was applied to this instance */
  isException: boolean;
}

export type CalendarView = "month" | "week" | "day" | "3day" | "agenda";

/** Half-open time window [start, end) in epoch ms. */
export interface TimeWindow {
  start: number;
  end: number;
}
