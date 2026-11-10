// Pure helpers for the Flows MCP App view (lib/mcp/app/flows-view.ts): what a
// stream row says and where its deadline marks sit. No DOM, no clock, so they
// are unit-tested on their own; the view only paints what these return.

import type { FlowStreamOut, FlowTaskOut } from "@/lib/mcp/flows";

export type ViewLocale = "en" | "ru";

/** The strip under a stream spans this many days before and after today. */
export const STRIP_PAST_DAYS = 3;
export const STRIP_FUTURE_DAYS = 14;

const DAY_MS = 86_400_000;
const utcMs = (date: string): number => Date.parse(`${date}T00:00:00Z`);

/** Whole days from `today` to `date` (both "yyyy-MM-dd"); negative = past. */
export function daysBetween(today: string, date: string): number {
  return Math.round((utcMs(date) - utcMs(today)) / DAY_MS);
}

export function pickLocale(tag: string | undefined | null): ViewLocale {
  return typeof tag === "string" && tag.toLowerCase().startsWith("ru") ? "ru" : "en";
}

/** Russian plural form for a count: 1 день, 2 дня, 5 дней. */
function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const STRINGS = {
  en: {
    title: "Streams",
    newTask: "New task",
    edit: "Edit",
    editTask: (title: string) => `Edit “${title}”`,
    save: "Save",
    create: "Create",
    cancel: "Close",
    del: "Delete",
    delConfirm: "Delete for good?",
    delSubtasks: (n: number) => `Its ${n} subtask${n === 1 ? "" : "s"} go with it.`,
    fTitle: "Title",
    fDue: "Deadline",
    fStart: "Start",
    fPriority: "Priority",
    fTags: "Tags",
    tagsHint: "separate with commas",
    priorityNone: "None",
    subtasksTitle: "Subtasks",
    subAdd: "Add a subtask",
    subAddButton: "Add",
    subDone: (title: string) => `“${title}” done`,
    subDelete: (title: string) => `Delete subtask “${title}”`,
    subRename: (title: string) => `Rename subtask “${title}”`,
    subEmpty: "No subtasks yet.",
    titleNeeded: "A task needs a title.",
    saved: "Saved.",
    created: (title: string) => `“${title}” created.`,
    deleted: (title: string) => `“${title}” deleted.`,
    actionFailed: "That did not go through. Nothing was changed.",
    reopen: "Reopen",
    views: { calendar: "Calendar", flows: "Flows", now: "Now" },
    view: "View",
    pick: "Pick a runway to see its task.",
    noDeadline: "no deadline",
    subtasks: (done: number, total: number) => `${done} of ${total} subtasks`,
    nowEmpty: "Nothing needs attention right now.",
    nowCount: (n: number) => `${n} need${n === 1 ? "s" : ""} attention`,
    calendarEmpty: "Nothing planned",
    calendarFailed: "Could not load the calendar.",
    allDay: "all day",
    dueTask: "due",
    runway: (title: string, detail: string) => (detail ? `${title}: ${detail}` : title),
    empty: "No streams yet: nothing is open in this view.",
    loading: "Loading…",
    failed: "Could not load the streams.",
    retry: "Try again",
    refresh: "Refresh",
    groupBy: "Group by",
    attention: "Attention",
    mine: "Only mine",
    open: (n: number) => `${n} open`,
    overdue: (n: number) => `${n} overdue`,
    needs: (n: number) => `${n} need${n === 1 ? "s" : ""} attention`,
    next: (label: string) => `next ${label}`,
    allDone: "Nothing open",
    more: (n: number) => `and ${n} more`,
    done: "Done",
    markDone: (title: string) => `Mark “${title}” as done`,
    markedDone: (title: string) => `“${title}” marked done.`,
    doneFailed: "Could not mark it done.",
    truncated: "Showing the 30 most pressing streams.",
    today: "today",
    tomorrow: "tomorrow",
    inDays: (n: number) => `in ${n}d`,
    late: (n: number) => `${n}d late`,
    now: "Now",
    groups: {
      tag: "Tag",
      category: "Category",
      collection: "Collection",
      assignee: "Assignee",
      status: "Status",
      priority: "Priority",
    },
    modes: { combined: "Both", deadline: "Deadline", priority: "Priority" },
    priority: ["", "low", "medium", "high"],
  },
  ru: {
    title: "Направления",
    newTask: "Новая задача",
    edit: "Изменить",
    editTask: (title: string) => `Изменить «${title}»`,
    save: "Сохранить",
    create: "Создать",
    cancel: "Закрыть",
    del: "Удалить",
    delConfirm: "Удалить насовсем?",
    delSubtasks: (n: number) => `Вместе с ней удалятся подзадачи: ${n}.`,
    fTitle: "Название",
    fDue: "Срок",
    fStart: "Начало",
    fPriority: "Приоритет",
    fTags: "Теги",
    tagsHint: "через запятую",
    priorityNone: "Нет",
    subtasksTitle: "Подзадачи",
    subAdd: "Добавить подзадачу",
    subAddButton: "Добавить",
    subDone: (title: string) => `«${title}» сделана`,
    subDelete: (title: string) => `Удалить подзадачу «${title}»`,
    subRename: (title: string) => `Переименовать подзадачу «${title}»`,
    subEmpty: "Подзадач пока нет.",
    titleNeeded: "Задаче нужно название.",
    saved: "Сохранено.",
    created: (title: string) => `«${title}» создана.`,
    deleted: (title: string) => `«${title}» удалена.`,
    actionFailed: "Не получилось. Ничего не изменено.",
    reopen: "Вернуть в работу",
    views: { calendar: "Календарь", flows: "Потоки", now: "Сейчас" },
    view: "Вид",
    pick: "Выберите полосу, чтобы увидеть задачу.",
    noDeadline: "без срока",
    subtasks: (done: number, total: number) => `подзадачи: ${done} из ${total}`,
    nowEmpty: "Сейчас ничего не требует внимания.",
    nowCount: (n: number) => `требует внимания: ${n}`,
    calendarEmpty: "Ничего не запланировано",
    calendarFailed: "Не удалось загрузить календарь.",
    allDay: "весь день",
    dueTask: "срок",
    runway: (title: string, detail: string) => (detail ? `${title}: ${detail}` : title),
    empty: "Направлений пока нет: в этом виде нет открытых задач.",
    loading: "Загрузка…",
    failed: "Не удалось загрузить направления.",
    retry: "Повторить",
    refresh: "Обновить",
    groupBy: "Группировка",
    attention: "Внимание",
    mine: "Только мои",
    open: (n: number) => `открыто: ${n}`,
    overdue: (n: number) => `просрочено: ${n}`,
    needs: (n: number) => `требует внимания: ${n}`,
    next: (label: string) => `срок ${label}`,
    allDone: "Открытых нет",
    more: (n: number) => `и ещё ${n}`,
    done: "Готово",
    markDone: (title: string) => `Отметить «${title}» сделанной`,
    markedDone: (title: string) => `«${title}» отмечена сделанной.`,
    doneFailed: "Не получилось отметить.",
    truncated: "Показаны 30 самых срочных направлений.",
    today: "сегодня",
    tomorrow: "завтра",
    inDays: (n: number) => `через ${n} ${ruPlural(n, "день", "дня", "дней")}`,
    late: (n: number) => `опоздание ${n} ${ruPlural(n, "день", "дня", "дней")}`,
    now: "Сейчас",
    groups: {
      tag: "Тег",
      category: "Категория",
      collection: "Коллекция",
      assignee: "Исполнитель",
      status: "Статус",
      priority: "Приоритет",
    },
    modes: { combined: "Оба", deadline: "Срок", priority: "Приоритет" },
    priority: ["", "низкий", "средний", "высокий"],
  },
} as const;

export type Strings = (typeof STRINGS)[ViewLocale];

/** "today", "tomorrow", "in 4d", "2d late", or a short date further out. */
export function deadlineLabel(
  dueDate: string | undefined,
  today: string,
  locale: ViewLocale,
): string | null {
  if (!dueDate) return null;
  const days = daysBetween(today, dueDate);
  if (Number.isNaN(days)) return null;
  const s = STRINGS[locale];
  if (days < 0) return s.late(-days);
  if (days === 0) return s.today;
  if (days === 1) return s.tomorrow;
  if (days <= STRIP_FUTURE_DAYS) return s.inDays(days);
  // Day first in both languages, like the planner itself ("25 Dec", "25 дек.").
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ru", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    utcMs(dueDate),
  );
}

/** Attention as the view shows it: a level, never a bare number. */
export function attentionLevel(score: number): "now" | "soon" | "none" {
  if (score >= 0.75) return "now";
  if (score >= 0.5) return "soon";
  return "none";
}

/** A task's line of detail: its deadline, then its priority when it has one. */
export function taskDetail(task: FlowTaskOut, today: string, locale: ViewLocale): string {
  const parts: string[] = [];
  const due = deadlineLabel(task.dueDate, today, locale);
  if (due) parts.push(due);
  const priority = STRINGS[locale].priority[task.priority ?? 0];
  if (priority) parts.push(priority);
  return parts.join(" · ");
}

/** A stream's one-line summary, the same facts the web app's stream row shows. */
export function streamSummary(stream: FlowStreamOut, today: string, locale: ViewLocale): string {
  const s = STRINGS[locale];
  if (stream.open === 0) return s.allDone;
  const parts = [s.open(stream.open)];
  if (stream.overdue > 0) parts.push(s.overdue(stream.overdue));
  const next = deadlineLabel(stream.nextDue, today, locale);
  if (next && !(stream.overdue > 0 && stream.nextDue && stream.nextDue < today)) parts.push(s.next(next));
  return parts.join(" · ");
}

export interface StripMark {
  /** 0..1 across the strip, left = STRIP_PAST_DAYS ago */
  x: number;
  overdue: boolean;
  /** how many of the stream's listed tasks share this day */
  count: number;
}

/** Where today sits on the strip (0..1). */
export const STRIP_NOW_X = STRIP_PAST_DAYS / (STRIP_PAST_DAYS + STRIP_FUTURE_DAYS);

/**
 * The deadline marks of a stream's listed tasks, one per day, clamped into the
 * strip so a long-overdue or far-off deadline still shows at its edge.
 */
export function stripMarks(tasks: readonly FlowTaskOut[], today: string): StripMark[] {
  const span = STRIP_PAST_DAYS + STRIP_FUTURE_DAYS;
  const byDay = new Map<number, StripMark>();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const days = daysBetween(today, task.dueDate);
    if (Number.isNaN(days)) continue;
    const clamped = Math.min(STRIP_FUTURE_DAYS, Math.max(-STRIP_PAST_DAYS, days));
    const mark = byDay.get(clamped);
    if (mark) mark.count += 1;
    else byDay.set(clamped, { x: (clamped + STRIP_PAST_DAYS) / span, overdue: days < 0, count: 1 });
  }
  return [...byDay.values()].sort((a, b) => a.x - b.x);
}

// -- Runways: the Flows view --------------------------------------------------

/** The Flows view shows this many days before and after today. */
export const RUNWAY_PAST_DAYS = 14;
export const RUNWAY_FUTURE_DAYS = 21;
/** Where today sits across the track (0..1). */
export const RUNWAY_NOW_X = RUNWAY_PAST_DAYS / (RUNWAY_PAST_DAYS + RUNWAY_FUTURE_DAYS);
/** How far past today an undated task's open-ended runway is drawn. */
const OPEN_ENDED_DAYS = 4;

export type RunwayState = "open" | "late" | "planned" | "open-ended";

export interface Runway {
  state: RunwayState;
  /** the bar, 0..1 across the track (clamped into it) */
  x0: number;
  x1: number;
  /** the bar starts before / ends after what the track shows */
  clippedStart: boolean;
  clippedEnd: boolean;
  /** share of the bar that is done, 0..1 (0 when the task has no subtasks) */
  fill: number;
  /** late only: the hatched span from the deadline to today */
  over: { x0: number; x1: number } | null;
}

/**
 * A task as a runway: a bar from its start to its deadline. A late task gets
 * the span from the deadline to today as its overrun; a task with no deadline
 * runs a little past today and has no end. Positions are fractions of the
 * track, so the view only multiplies by its width.
 */
export function runwayOf(task: FlowTaskOut, today: string): Runway {
  const span = RUNWAY_PAST_DAYS + RUNWAY_FUTURE_DAYS;
  const pos = (days: number) => (days + RUNWAY_PAST_DAYS) / span;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));

  const dueDays = task.dueDate ? daysBetween(today, task.dueDate) : Number.NaN;
  const hasDue = !Number.isNaN(dueDays);
  let startDays = task.start ? daysBetween(today, task.start) : Number.NaN;
  // No usable start: a week of runway before the deadline, or before today.
  if (Number.isNaN(startDays)) startDays = (hasDue ? dueDays : 0) - 7;
  // A deadline on or before the start still needs a bar one can see and press.
  const endDays = hasDue ? Math.max(dueDays, startDays + 1) : Math.max(0, startDays) + OPEN_ENDED_DAYS;

  const late = hasDue && dueDays < 0;
  const state: RunwayState = !hasDue ? "open-ended" : late ? "late" : startDays > 0 ? "planned" : "open";
  const total = task.progress?.total ?? 0;
  // Kept a sliver inside the right edge, so a runway wholly beyond the track
  // still shows as a stub there instead of vanishing.
  const x0 = Math.min(clamp(pos(startDays)), 0.98);
  const x1 = clamp(pos(endDays));
  return {
    state,
    x0,
    // Never thinner than a sliver, even squeezed against an edge of the track.
    x1: Math.max(x1, Math.min(1, x0 + 0.02)),
    clippedStart: pos(startDays) < 0,
    clippedEnd: pos(endDays) > 1,
    fill: total > 0 ? Math.min(1, (task.progress?.done ?? 0) / total) : 0,
    over: late ? { x0: clamp(pos(dueDays)), x1: RUNWAY_NOW_X } : null,
  };
}

/** A bar narrower than this share of the track cannot hold its title: it goes beside the bar. */
export const RUNWAY_NARROW = 0.24;

/** Where a runway's words go: inside the bar, after it, or before it. */
export function runwayLabelSide(runway: Runway): "after" | "before" | "inside" {
  const end = Math.max(runway.x1, runway.over?.x1 ?? 0);
  if (end <= 0.78) return "after";
  return runway.x0 >= 0.3 ? "before" : "inside";
}

/** The words beside a runway's end: how long is left, or how far over. */
export function runwayLabel(task: FlowTaskOut, today: string, locale: ViewLocale): string | null {
  return deadlineLabel(task.dueDate, today, locale);
}

/** Week ticks for the Flows ruler: a date label and its position, Mondays only. */
export function runwayTicks(today: string, locale: ViewLocale): { x: number; label: string }[] {
  const span = RUNWAY_PAST_DAYS + RUNWAY_FUTURE_DAYS;
  const format = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ru", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const ticks: { x: number; label: string }[] = [];
  for (let d = -RUNWAY_PAST_DAYS; d <= RUNWAY_FUTURE_DAYS; d++) {
    const ms = Date.parse(`${today}T00:00:00Z`) + d * 86_400_000;
    // Mondays only, and none where it would sit under the "Now" pill or be
    // cut off by the track's right edge.
    if (new Date(ms).getUTCDay() !== 1 || Math.abs(d) < 3 || d > RUNWAY_FUTURE_DAYS - 2) continue;
    ticks.push({ x: (d + RUNWAY_PAST_DAYS) / span, label: format.format(ms) });
  }
  return ticks;
}

// -- Now: one ranked list across every stream ----------------------------------

export interface NowItem {
  task: FlowTaskOut;
  /** labels of every stream the task was listed under */
  streams: string[];
}

/** Every listed task that needs attention, once each, most pressing first. */
export function nowItems(streams: readonly FlowStreamOut[]): NowItem[] {
  const byId = new Map<string, NowItem>();
  for (const stream of streams) {
    for (const task of stream.tasks) {
      if (task.score < 0.5) continue;
      const item = byId.get(task.id);
      if (item) item.streams.push(stream.label);
      else byId.set(task.id, { task, streams: [stream.label] });
    }
  }
  return [...byId.values()].sort((a, b) => {
    if (a.task.score !== b.task.score) return b.task.score - a.task.score;
    return (a.task.dueDate ?? "9999").localeCompare(b.task.dueDate ?? "9999");
  });
}

// -- Calendar: the next seven days ---------------------------------------------

export interface CalendarEventIn {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
}

export interface CalendarDay {
  date: string;
  /** timed and all-day events starting that local day, in order */
  events: { title: string; time: string | null }[];
  /** tasks due that day */
  due: FlowTaskOut[];
}

/**
 * The next `days` local days, each with its events and the tasks due on it.
 * `localDate` and `localTime` turn an event's instant into the viewer's date
 * and clock time (the view passes the browser's; tests pass fixed ones), so
 * this stays free of the clock and the time zone. An all-day event's date is
 * floating: it is read from the ISO string itself, never shifted.
 */
export function calendarDays(
  today: string,
  days: number,
  events: readonly CalendarEventIn[],
  streams: readonly FlowStreamOut[],
  localDate: (iso: string) => string,
  localTime: (iso: string) => string,
): CalendarDay[] {
  const out: CalendarDay[] = [];
  const index = new Map<string, CalendarDay>();
  for (let d = 0; d < days; d++) {
    const date = new Date(Date.parse(`${today}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
    const day: CalendarDay = { date, events: [], due: [] };
    out.push(day);
    index.set(date, day);
  }
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  for (const event of sorted) {
    const date = event.allDay ? event.start.slice(0, 10) : localDate(event.start);
    index.get(date)?.events.push({ title: event.title, time: event.allDay ? null : localTime(event.start) });
  }
  const seen = new Set<string>();
  for (const stream of streams) {
    for (const task of stream.tasks) {
      if (!task.dueDate || seen.has(task.id)) continue;
      seen.add(task.id);
      index.get(task.dueDate)?.due.push(task);
    }
  }
  return out;
}

// -- Editing ---------------------------------------------------------------------

export interface TaskDraft {
  title: string;
  dueDate: string;
  startDate: string;
  /** "" = none, else "1".."3" */
  priority: string;
  /** as typed: comma-separated */
  tags: string;
}

export const EMPTY_DRAFT: TaskDraft = { title: "", dueDate: "", startDate: "", priority: "", tags: "" };

interface DraftSource {
  title: string;
  dueDate?: string;
  startDate?: string;
  priority?: number;
  tags: readonly string[];
}

export function draftOf(task: DraftSource): TaskDraft {
  return {
    title: task.title,
    dueDate: task.dueDate ?? "",
    startDate: task.startDate ?? "",
    priority: task.priority ? String(task.priority) : "",
    tags: task.tags.join(", "),
  };
}

/** The tags a draft names: split on commas, trimmed, empties and repeats dropped (the server normalizes). */
export function draftTags(draft: TaskDraft): string[] {
  const out: string[] = [];
  for (const raw of draft.tags.split(",")) {
    const tag = raw.trim();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateOrNull = (value: string): string | null => (DATE_RE.test(value) ? value : null);

/** `create_task` arguments for a draft, or null when it has no title. */
export function createArgs(draft: TaskDraft, parentId?: string): Record<string, unknown> | null {
  const title = draft.title.trim();
  if (!title) return null;
  const tags = draftTags(draft);
  return {
    title,
    ...(parentId ? { parentId } : {}),
    ...(dateOrNull(draft.dueDate) ? { dueDate: draft.dueDate } : {}),
    ...(dateOrNull(draft.startDate) ? { startDate: draft.startDate } : {}),
    ...(draft.priority ? { priority: Number(draft.priority) } : {}),
    ...(tags.length ? { tags } : {}),
  };
}

/**
 * `update_task` arguments holding only what the draft changed against the task
 * as loaded: `{}` when nothing did, null when the title was emptied. A cleared
 * date or priority is sent as null, cleared tags as [].
 */
export function updateArgs(original: DraftSource, draft: TaskDraft): Record<string, unknown> | null {
  const title = draft.title.trim();
  if (!title) return null;
  const before = draftOf(original);
  const patch: Record<string, unknown> = {};
  if (title !== original.title) patch.title = title;
  if (draft.dueDate !== before.dueDate) patch.dueDate = dateOrNull(draft.dueDate);
  if (draft.startDate !== before.startDate) patch.startDate = dateOrNull(draft.startDate);
  if (draft.priority !== before.priority) patch.priority = draft.priority ? Number(draft.priority) : null;
  const tags = draftTags(draft);
  if (tags.join(",") !== original.tags.join(",")) patch.tags = tags;
  return patch;
}
