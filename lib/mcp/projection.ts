import "server-only";
import type { Occurrence, TaskRow } from "@/lib/types";

const MAX_TITLE_LEN = 120;

function clipTitle(title: string): string {
  return title.length > MAX_TITLE_LEN ? title.slice(0, MAX_TITLE_LEN) : title;
}

const toIso = (ms: number): string => new Date(ms).toISOString();

export type PartnerAgendaMode = "none" | "busy" | "shared";

interface OwnAgendaEvent {
  owner: "me";
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
}

interface SharedPartnerAgendaEvent {
  owner: "partner";
  title: string;
  start: string;
  end: string;
  allDay: boolean;
}

interface BusyPartnerAgendaEvent {
  owner: "partner";
  busy: true;
  start: string;
  end: string;
  allDay: boolean;
}

export type AgendaEvent =
  | OwnAgendaEvent
  | SharedPartnerAgendaEvent
  | BusyPartnerAgendaEvent;

/**
 * Project a window's expanded occurrences into `get_agenda`'s event shape.
 * Inactive (e.g. sleep) and cancelled occurrences are dropped. The caller's
 * own occurrences keep id/title/location; the partner's are reshaped per
 * `partnerMode` and NEVER carry an id, description, or location — in "busy"
 * mode they don't even carry a title. A private partner occurrence is
 * dropped here as defense in depth even though RLS already withholds it
 * upstream (`fetchWindow` never returns another member's private rows).
 * Pure: takes the already-fetched/expanded occurrences and does no I/O.
 */
export function projectAgenda(
  occurrences: Occurrence[],
  memberId: string,
  partnerMode: PartnerAgendaMode,
): AgendaEvent[] {
  const events: AgendaEvent[] = [];
  for (const o of occurrences) {
    if (o.inactive || o.status === "cancelled") continue;

    if (o.ownerId === memberId) {
      events.push({
        owner: "me",
        id: o.eventId,
        title: clipTitle(o.title),
        start: toIso(o.start),
        end: toIso(o.end),
        allDay: o.allDay,
        location: o.location,
      });
      continue;
    }

    if (o.isPrivate) continue; // defense in depth; never Anchor's to see
    if (partnerMode === "shared") {
      events.push({
        owner: "partner",
        title: clipTitle(o.title),
        start: toIso(o.start),
        end: toIso(o.end),
        allDay: o.allDay,
      });
    } else if (partnerMode === "busy") {
      events.push({
        owner: "partner",
        busy: true,
        start: toIso(o.start),
        end: toIso(o.end),
        allDay: o.allDay,
      });
    }
    // partnerMode === "none": the partner's occurrence is dropped entirely.
  }
  events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return events;
}

export type AgendaTaskStatus = "todo" | "in_progress" | "done";

export interface AgendaTask {
  id: string;
  title: string;
  dueDate: string | null;
  overdue: boolean;
  status: AgendaTaskStatus;
}

/**
 * Select and shape the caller's own open tasks for `get_agenda`: top-level
 * tasks and subtasks, not completed, whose `dueDate` falls on or before the
 * window's last local day, plus statusless-due tasks that are `in_progress`.
 * `today` is the query's anchor date (`date`, yyyy-MM-dd) — a task is
 * `overdue` when its due date is strictly before it. `status` is computed by
 * the caller (it needs the board bundle) and passed in per task.
 */
export function projectAgendaTasks(
  tasks: (TaskRow & { status: AgendaTaskStatus })[],
  memberId: string,
  today: string,
  lastDay: string,
): AgendaTask[] {
  return tasks
    .filter((t) => t.ownerId === memberId && t.completedAt == null)
    .filter((t) =>
      t.dueDate != null ? t.dueDate <= lastDay : t.status === "in_progress",
    )
    .map((t) => ({
      id: t.id,
      title: clipTitle(t.title),
      dueDate: t.dueDate,
      overdue: t.dueDate != null && t.dueDate < today,
      status: t.status,
    }));
}
