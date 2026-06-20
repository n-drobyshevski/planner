// Shared domain types. Times are epoch milliseconds (UTC) inside the app;
// the data layer converts to/from Postgres `timestamptz` at the boundary.

import type { ItemAttributes } from "@/lib/attributes/schema";
import type { FlowLineStyle } from "@/lib/tasks/flow-line-styles";

export type OverrideType = "cancel" | "modify";
/** An event's lifecycle state, driving how it renders on the calendar:
 *  'cancelled' (diagonal grayed stripes), 'planned' (dotted outline), or
 *  'confirmed' (plain fill, the default). */
export type EventStatus = "cancelled" | "planned" | "confirmed";
/** A normal calendar event vs. a "context" — a Context's time-block on the
 *  calendar (a backdrop painting the category in `categoryId`). */
export type EventKind = "event" | "context";

/** Supported UI languages (per member). Mirror the DB CHECK + i18n routing. */
export type AppLocale = "en" | "ru";

/** Appearance preferences, stored per member. Mirror the DB CHECK constraints. */
export type ThemePreference = "light" | "dark" | "system";
/** The 14 Catppuccin accent colors plus warm `stone` (the warm-neutral brand
 *  default). Each has a default-(warm)-palette hex plus a value per Catppuccin
 *  flavor (see the --swatch-* / [data-accent] CSS). */
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
  | "lavender"
  | "stone";
export type SurfaceTone = "warm" | "neutral" | "cool";
/**
 * Full-palette theme. `default` keeps the native warm system (light/dark +
 * accent + tone); the Catppuccin flavors override the entire palette and own
 * their own light/dark mode (Latte is light, the rest are dark). `pink` is a
 * drenched soft-blossom palette whose every token derives from one configurable
 * base hue (`Member.pinkBase` → the `--pink-base` CSS var); unlike Catppuccin it
 * stays light/dark-aware (it honors the member's themePreference).
 */
export type Palette =
  | "default"
  | "pink"
  | "catppuccin-latte"
  | "catppuccin-frappe"
  | "catppuccin-macchiato"
  | "catppuccin-mocha";
/**
 * How a context time-block is labelled in the week/day grid. `bar` is the
 * default horizontal title bar across the top; `side` moves the name (and time,
 * when there's room) to a vertical strip on the right edge, rotated so the
 * glyph-tops face left. Mirror the DB CHECK constraint.
 */
export type ContextLabel = "bar" | "side";

export interface Member {
  id: string;
  workspaceId: string;
  authUserId: string | null;
  name: string;
  color: string; // hex accent
  hasPin: boolean; // a passphrase secret is set (scrypt; the legacy "PIN" UX gate)
  hasPasskey: boolean; // at least one WebAuthn credential registered
  // UI language (per member). Mirrors the DB CHECK; "en" default. Cross-device
  // source of truth the app reconciles the URL `[locale]` segment to on load.
  locale: AppLocale;
  // Appearance preferences (per member).
  themePreference: ThemePreference;
  accent: AccentId;
  surfaceTone: SurfaceTone;
  palette: Palette;
  // The configurable base hue for the `pink` palette (a `#rrggbb` hex), or null
  // to use the default pink. Only meaningful while `palette === "pink"`.
  pinkBase: string | null;
  // Time-zone preferences (per member). `timezone` null = follow the device;
  // `secondaryTimezone` null = no secondary zone shown. Both are IANA names.
  timezone: string | null;
  secondaryTimezone: string | null;
  // When false, inactive (grayed-out) events are hidden in the cramped month
  // view; they always show in the denser week/day grids. Defaults to true.
  showInactiveInMonth: boolean;
  // When false, success/confirmation toasts are suppressed; error and warning
  // toasts always show. Defaults to true.
  showSuccessToasts: boolean;
  // How context time-blocks are labelled in the week/day grid. Defaults to "bar".
  contextLabel: ContextLabel;
}

/**
 * A member's sleep PREFERENCES, member-private under RLS (like SleepLog): the
 * partner can never read these rows. Sleep planning — one full sleep cycle in
 * minutes, time to fall asleep after getting into bed, the nightly cycle target
 * (DB defaults 90 / 15 / 5) — plus derivation controls: the dedicated sleep
 * category (null = the inactive≡sleep heuristic) and the night collection
 * window (start hour 12..23 on the evening before, end hour 4..16 on the wake
 * day; defaults 20 / 12).
 */
export interface MemberSleepPrefs {
  memberId: string;
  workspaceId: string;
  sleepCycleLengthMin: number;
  sleepOnsetLatencyMin: number;
  targetSleepCycles: number;
  sleepCategoryId: string | null;
  nightWindowStartHour: number;
  nightWindowEndHour: number;
}

/**
 * A member's sleep log for one night, keyed by the WAKE date (`date` is a
 * zone-free yyyy-MM-dd token). Member-private under RLS: the partner can
 * never read these rows. `bedtimeAt`/`wokeAt` are optional real instants;
 * `quality` is 1..4 (poor→great), `fatigue` is 1..4 (alert→exhausted).
 */
export interface SleepLog {
  id: string;
  workspaceId: string;
  memberId: string;
  date: string;
  bedtimeAt: number | null;
  wokeAt: number | null;
  quality: number | null;
  fatigue: number | null;
  note: string | null;
  createdAt: number;
}

export interface Category {
  id: string;
  workspaceId: string;
  ownerId: string | null; // null = shared category
  name: string;
  color: string; // hex
  sortOrder: number;
}

/** A collection — a named group of tasks, viewable as a Board (kanban), List, or
 *  Flows. Personal (owner = a member) or Shared (ownerId null, both members see
 *  + edit). Mirrors Category. */
export interface Collection {
  id: string;
  workspaceId: string;
  ownerId: string | null; // null = shared collection
  name: string;
  color: string; // hex
  sortOrder: number;
}

/**
 * A board — one column/state of a collection's kanban. A collection HAS MANY
 * boards (its ordered columns); a task's lifecycle state is *which board it sits
 * in* (`TaskRow.boardId`). Each board owns its Flows line style and a `isDone`
 * flag marking the completion column (drives `completedAt`, overdue, and the
 * Flows "done" markers). Visibility/editability is inherited from the collection.
 */
export interface Board {
  id: string;
  workspaceId: string;
  collectionId: string;
  name: string;
  /** Flows trunk stroke pattern for tasks in this state; see lib/tasks/flow-line-styles.ts */
  lineStyle: FlowLineStyle;
  /** order within its collection's columns */
  position: number;
  /** true = the completion column; entering it sets the task's completedAt */
  isDone: boolean;
  createdAt: number;
  updatedAt: number;
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
  /**
   * per-event joint flag: a non-private event marked Shared is joint (both see
   * + edit) even outside a Shared context. Effective jointness is the union of
   * this with the shared-context derivation — see the derived `Occurrence.isShared`.
   */
  isShared: boolean;
  /**
   * Phase 4 public-sharing opt-out: when true, this event is withheld from every
   * public share link (and present mode), independent of `isPrivate`. A non-private
   * event is normally eligible for public links; this flag hides just this one.
   */
  hiddenFromPublic: boolean;
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
  /** optimization attributes (energy/flexibility/...); series-level jsonb bag, see lib/attributes/schema.ts */
  attributes: ItemAttributes;
  createdAt: number;
  updatedAt: number;
}

export interface TaskRow {
  id: string;
  workspaceId: string;
  ownerId: string; // creator; drives edit rights
  assigneeId: string | null; // responsible member; null = unassigned
  parentId: string | null; // subtask -> parent; null = top-level
  collectionId: string | null; // the collection this task lives in
  categoryId: string | null;
  title: string;
  description: string | null;
  /** true = only the owner can see it; false (default) = shared with the workspace */
  isPrivate: boolean;
  /** per-item color override (hex); null = derive from category/owner */
  color: string | null;
  /** which board (column/state) the task sits in; null = no collection/board */
  boardId: string | null;
  /** 0..3 priority; null = none */
  priority: number | null;
  /** optional deadline as a zone-free calendar date ("yyyy-MM-dd"); overdue is judged in the viewer's zone */
  dueDate: string | null;
  /** optional planned start as a zone-free calendar date ("yyyy-MM-dd"); null = anchor to creation in Flows */
  startDate: string | null;
  /** true = a point-in-time task; Flows renders it as a single moment marker, not a span */
  isMilestone: boolean;
  /** order within its board column / among siblings */
  position: number;
  /** parent only: subtasks must be completed in order */
  sequential: boolean;
  /** set when the task enters a done-board, epoch ms */
  completedAt: number | null;
  /** optimization attributes (energy/flexibility/...); jsonb bag, see lib/attributes/schema.ts */
  attributes: ItemAttributes;
  createdAt: number;
  updatedAt: number;
}

/**
 * One recorded task board (state) transition. Append-only history behind the
 * Flows view; written by a DB trigger, never by the client. `fromBoardId` is null
 * for the creation event (and for events of null-collection tasks). `toIsDone` is
 * denormalized from the destination board so Flows can classify a Done node
 * without a board lookup (boards may be renamed/reordered later).
 */
export interface TaskStatusEvent {
  id: string;
  taskId: string;
  workspaceId: string;
  fromBoardId: string | null;
  toBoardId: string | null;
  toIsDone: boolean;
  changedBy: string | null;
  changedAt: number;
}

/** A small set of marker shapes for a checkpoint. Shape carries meaning so the
 *  marker never relies on color alone (design system). Mirror the DB CHECK and
 *  the Zod enum in lib/tasks/schemas.ts. */
export type CheckpointShape = "flag" | "diamond" | "star" | "dot" | "triangle";

/**
 * A flow milestone *checkpoint*: a user-placed marker at a date along a top-level
 * task's trunk in the Flows view. A task HAS MANY checkpoints. Distinct from
 * `TaskRow.isMilestone` (a whole-task point-lane). `atDate` is a zone-free
 * calendar-date token ("yyyy-MM-dd"), like dueDate/startDate. `color` null =
 * inherit the flow's resolved color. `reached` is the authoritative done flag;
 * `reachedAt` is the epoch-ms stamp it was set, or null.
 */
export interface TaskCheckpoint {
  id: string;
  taskId: string;
  workspaceId: string;
  title: string;
  atDate: string; // "yyyy-MM-dd"
  reached: boolean;
  reachedAt: number | null;
  color: string | null; // hex override; null = inherit flow color
  shape: CheckpointShape;
  position: number;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

/** A blocks/blocked-by edge: `taskId` is blocked until `dependsOnTaskId` is done. */
export interface TaskDependency {
  id: string;
  workspaceId: string;
  taskId: string;
  dependsOnTaskId: string;
  createdAt: number;
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
  /**
   * true when filed under a Shared context (its category's owner_id IS NULL) —
   * a JOINT event: both members see it without overlaying the owner's calendar
   * and both may edit it. Derived at expansion from the workspace's shared
   * categories (not stored on the event row).
   */
  isShared: boolean;
  /** inherited from the event: withheld from public share links + present mode */
  hiddenFromPublic: boolean;
  /** when set, this occurrence is a scheduled block of a task */
  taskId: string | null;
  /** optimization attributes, inherited from the master event (series-level, not overridable) */
  attributes: ItemAttributes;
  isRecurring: boolean;
  /** true when a `modify` override was applied to this instance */
  isException: boolean;
}

/** Phase 4 — a public share link the owner manages (lib/scope/visibility config). */
export interface PublicShareRow {
  id: string;
  workspaceId: string;
  ownerId: string;
  /** the unguessable URL token (`/share/<token>`) */
  token: string;
  /** owner's memo for the link, e.g. "Family"; null = unnamed */
  label: string | null;
  /** show real event titles vs the generic "Busy" block */
  showEventTitles: boolean;
  /** show event descriptions & locations (only effective when titles are shown) */
  showEventDetails: boolean;
  /** show real context-window names (the labelled day-structure bands) vs "Busy" */
  showContextNames: boolean;
  /** category allow-list; null = all (non-private, non-hidden) categories */
  categoryIds: string[] | null;
  /** show inactive (sleep/blocked) time as a shaded "Unavailable" band */
  showInactive: boolean;
  /** epoch ms; null = never expires */
  expiresAt: number | null;
  /** epoch ms the link was permanently disabled; null = active */
  revokedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Phase 4 — a public viewer's proposed timeslot, awaiting the owner's decision. */
export interface TimeslotRequestRow {
  id: string;
  shareId: string;
  workspaceId: string;
  /** the share's owner; RLS scopes visibility to them */
  ownerId: string;
  /** free-text name the requester gave; null = anonymous */
  requesterName: string | null;
  message: string | null;
  proposedStart: number; // epoch ms
  proposedEnd: number; // epoch ms
  status: "pending" | "approved" | "declined";
  createdAt: number;
  resolvedAt: number | null;
}

export type CalendarView = "month" | "week" | "day" | "3day" | "agenda";

/** Half-open time window [start, end) in epoch ms. */
export interface TimeWindow {
  start: number;
  end: number;
}

/**
 * A weekly time goal for one category (one per workspace × category).
 * Workspace-shared under RLS, like shared categories: both members see and
 * edit every goal. `weeklyTargetMs` is scaled to the viewed window by app
 * code (lib/insights/goals.ts); `direction` says whether it's a target to
 * reach ("at-least") or a budget cap ("at-most").
 */
export interface CategoryGoal {
  id: string;
  workspaceId: string;
  categoryId: string;
  /** weekly target/budget, ms (DB CHECK: 15 min .. 7 days) */
  weeklyTargetMs: number;
  direction: "at-least" | "at-most";
  createdBy: string;
  createdAt: number;
}

/**
 * A member's saved Insights view (named filter/period config). Member-private
 * under RLS — the partner never sees it. `config` is the raw jsonb bag;
 * lib/insights/views.ts validates it leniently on read.
 */
export interface InsightsView {
  id: string;
  workspaceId: string;
  memberId: string;
  name: string;
  config: unknown;
  position: number;
  createdAt: number;
}

/**
 * A member's Insights dashboard preferences (one row per member, member-
 * private under RLS). `dashboard` carries card order/hidden ids;
 * `suppressedKinds` lists suggestion kinds the member dismissed for good.
 */
export interface InsightsPrefs {
  memberId: string;
  workspaceId: string;
  dashboard: { order?: string[]; hidden?: string[] };
  suppressedKinds: string[];
  updatedAt: number;
}
