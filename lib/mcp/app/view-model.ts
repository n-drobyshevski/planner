// Pure helpers for the Flows MCP App view (lib/mcp/app/flows-view.ts): what a
// stream row says and where its deadline marks sit. No DOM, no clock, so they
// are unit-tested on their own; the view only paints what these return.

import type { FlowStreamOut, FlowSubtaskOut, FlowTaskOut } from "@/lib/mcp/flows";

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
    fCollection: "Collection",
    noCollection: "No collection",
    movedWith: (n: number) => `Its ${n} subtask${n === 1 ? "" : "s"} move with it.`,
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
    stream: "Stream",
    attention: "Attention",
    mine: "Only mine",
    open: (n: number) => `${n} open`,
    overdue: (n: number) => `${n} overdue`,
    needs: (n: number) => `${n} need${n === 1 ? "s" : ""} attention`,
    next: (label: string) => `next ${label}`,
    allDone: "Nothing open",
    more: (n: number) => `and ${n} more`,
    fewer: "Show fewer",
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
    expand: (title: string) => `Show the subtasks of “${title}”`,
    collapse: (title: string) => `Hide the subtasks of “${title}”`,
    waits: (titles: string) => `waits: ${titles}`,
    after: (title: string) => `after ${title}`,
    waitsDetail: (titles: string) => `waits for ${titles}`,
    waiting: "waiting",
    doneShort: "done",
    waitsFor: "Waits for",
    holds: "Holds",
    holdsNone: "Nothing waits for this task.",
    waitsNone: "Waits for nothing.",
    findTask: "Find a task to wait for",
    alreadyAdded: "already added",
    wouldLoop: "would make a loop",
    noMatch: "No matching open tasks.",
    unwait: (title: string) => `Stop waiting for “${title}”`,
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
    fCollection: "Коллекция",
    noCollection: "Без коллекции",
    movedWith: (n: number) => `Подзадачи переедут вместе с ней: ${n}.`,
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
    stream: "Направление",
    attention: "Внимание",
    mine: "Только мои",
    open: (n: number) => `открыто: ${n}`,
    overdue: (n: number) => `просрочено: ${n}`,
    needs: (n: number) => `требует внимания: ${n}`,
    next: (label: string) => `срок ${label}`,
    allDone: "Открытых нет",
    more: (n: number) => `и ещё ${n}`,
    fewer: "Свернуть",
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
    expand: (title: string) => `Показать подзадачи «${title}»`,
    collapse: (title: string) => `Скрыть подзадачи «${title}»`,
    waits: (titles: string) => `ждёт: ${titles}`,
    after: (title: string) => `после ${title}`,
    waitsDetail: (titles: string) => `ждёт ${titles}`,
    waiting: "ждёт",
    doneShort: "сделана",
    waitsFor: "Ждёт",
    holds: "Её ждут",
    holdsNone: "Эту задачу ничего не ждёт.",
    waitsNone: "Ничего не ждёт.",
    findTask: "Найти задачу, которую ждать",
    alreadyAdded: "уже добавлена",
    wouldLoop: "получится петля",
    noMatch: "Открытых задач с таким названием нет.",
    unwait: (title: string) => `Больше не ждать «${title}»`,
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
/** The same for a subtask's thinner bar, whose title is shorter and smaller. */
export const SUB_RUNWAY_NARROW = 0.1;

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
  /** "" = no collection, else a collection id */
  collection: string;
}

export const EMPTY_DRAFT: TaskDraft = {
  title: "",
  dueDate: "",
  startDate: "",
  priority: "",
  tags: "",
  collection: "",
};

interface DraftSource {
  title: string;
  dueDate?: string;
  startDate?: string;
  priority?: number;
  collectionId?: string;
  tags: readonly string[];
}

export function draftOf(task: DraftSource): TaskDraft {
  return {
    title: task.title,
    dueDate: task.dueDate ?? "",
    startDate: task.startDate ?? "",
    priority: task.priority ? String(task.priority) : "",
    tags: task.tags.join(", "),
    collection: task.collectionId ?? "",
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
    // A subtask names no collection: it goes where its parent is.
    ...(draft.collection && !parentId ? { collectionId: draft.collection } : {}),
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
  if (draft.collection !== before.collection) patch.collectionId = draft.collection || null;
  return patch;
}

// -- Subtasks on the timeline (B1) ------------------------------------------------

/** Row heights in the lane, in px; flows-view.css draws them the same. */
export const LANE_PAD = 8;
export const LANE_GAP = 4;
export const TASK_ROW = 32;
export const SUB_ROW = 22;
/** Deepest subtask level the lane shows. */
export const MAX_SUB_DEPTH = 3;

/**
 * A subtask as a runway, on its own dates. A missing date falls back to the
 * parent's, so an undated subtask spans its parent and a half-dated one stays
 * inside it where it can.
 */
export function subtaskRunway(sub: FlowSubtaskOut, parent: FlowTaskOut, today: string): Runway {
  let start = sub.start;
  let due = sub.due;
  if (!start && !due) {
    start = parent.start;
    due = parent.dueDate;
  } else if (!start) {
    if (parent.start && due && parent.start <= due) start = parent.start;
  } else if (!due) {
    if (parent.dueDate && parent.dueDate >= start) due = parent.dueDate;
  }
  const runway = runwayOf({ id: sub.id, title: sub.title, start, dueDate: due, score: 0, overdue: false }, today);
  // A done subtask is not late: it shows struck through instead.
  if (sub.done && runway.state === "late") return { ...runway, state: "open", over: null };
  return runway;
}

export type LaneRow =
  | { kind: "task"; id: string; task: FlowTaskOut; top: number; height: number }
  | { kind: "sub"; id: string; sub: FlowSubtaskOut; task: FlowTaskOut; top: number; height: number };

/** Done / total over a subtask's own subtree; null when it has none. */
export function subtreeProgress(subs: readonly FlowSubtaskOut[], id: string): { done: number; total: number } | null {
  const i = subs.findIndex((s) => s.id === id);
  if (i < 0) return null;
  const depth = subs[i].depth;
  let done = 0;
  let total = 0;
  // Pre-order: the subtree is the run of deeper rows right after it.
  for (let j = i + 1; j < subs.length && subs[j].depth > depth; j++) {
    total += 1;
    if (subs[j].done) done += 1;
  }
  return total > 0 ? { done, total } : null;
}

/**
 * The lane's rows, top to bottom: each task, and under an expanded one the
 * subtasks whose every ancestor is expanded too (to MAX_SUB_DEPTH), with
 * where each row sits (px from the lane's top).
 */
export function laneRows(tasks: readonly FlowTaskOut[], expanded: ReadonlySet<string>): LaneRow[] {
  const rows: LaneRow[] = [];
  let y = LANE_PAD;
  type RowIn =
    | { kind: "task"; id: string; task: FlowTaskOut }
    | { kind: "sub"; id: string; sub: FlowSubtaskOut; task: FlowTaskOut };
  const push = (row: RowIn, height: number) => {
    rows.push({ ...row, top: y, height } as LaneRow);
    y += height + LANE_GAP;
  };
  for (const task of tasks) {
    push({ kind: "task", id: task.id, task }, TASK_ROW);
    if (!expanded.has(task.id)) continue;
    // The deepest level still open; anything deeper than it stays hidden.
    let openTo = 1;
    for (const sub of task.subtasks ?? []) {
      if (sub.depth > openTo || sub.depth > MAX_SUB_DEPTH) continue;
      push({ kind: "sub", id: sub.id, sub, task }, SUB_ROW);
      openTo = expanded.has(sub.id) ? sub.depth + 1 : sub.depth;
    }
  }
  return rows;
}

/** Whether a lane row has subtasks of its own to expand. */
export function hasChildren(row: LaneRow): boolean {
  if (row.kind === "task") return (row.task.subtasks?.length ?? 0) > 0;
  if (row.sub.depth >= MAX_SUB_DEPTH) return false;
  const subs = row.task.subtasks ?? [];
  const i = subs.findIndex((s) => s.id === row.id);
  return i >= 0 && i + 1 < subs.length && subs[i + 1].depth > row.sub.depth;
}

/**
 * What a blocked subtask waits for, for its "after …" tag: its first named
 * blocker, else (waiting its turn under a "do in order" parent) the open
 * sibling just before it. Null when it is not blocked.
 */
export function subtaskWaitTitle(sub: FlowSubtaskOut, subs: readonly FlowSubtaskOut[]): string | null {
  if (!sub.blocked) return null;
  if (sub.waitingOn?.[0]) return sub.waitingOn[0].title;
  const i = subs.findIndex((s) => s.id === sub.id);
  for (let j = i - 1; j >= 0; j--) {
    if (subs[j].depth < sub.depth) break;
    if (subs[j].depth === sub.depth && subs[j].parentId === sub.parentId && !subs[j].done) return subs[j].title;
  }
  return null;
}

// -- Dependencies (A1, C1) ----------------------------------------------------------

/** A task or subtask anywhere in the loaded streams, once. */
export interface FlowItem {
  id: string;
  title: string;
  done: boolean;
  blocked: boolean;
  /** its first few open blockers, for labels */
  waitingOn: { id: string; title: string }[];
  /** every task it waits for, open or done: what links, arrows, dimming and the loop check use */
  blockedBy: string[];
  /** the stream it was first listed under */
  stream: string;
  /** set for a subtask: its top-level task's title */
  under?: string;
}

/** Every task and subtask in the loaded data, deduplicated, in listing order. */
export function flowItems(streams: readonly FlowStreamOut[]): FlowItem[] {
  const byId = new Map<string, FlowItem>();
  for (const stream of streams) {
    for (const task of stream.tasks) {
      if (!byId.has(task.id)) {
        byId.set(task.id, {
          id: task.id,
          title: task.title,
          done: false,
          blocked: task.blocked === true,
          waitingOn: task.waitingOn ?? [],
          blockedBy: task.blockedBy ?? (task.waitingOn ?? []).map((b) => b.id),
          stream: stream.label,
        });
      }
      for (const sub of task.subtasks ?? []) {
        if (byId.has(sub.id)) continue;
        byId.set(sub.id, {
          id: sub.id,
          title: sub.title,
          done: sub.done,
          blocked: sub.blocked === true,
          waitingOn: sub.waitingOn ?? [],
          blockedBy: sub.blockedBy ?? (sub.waitingOn ?? []).map((b) => b.id),
          stream: stream.label,
          under: task.title,
        });
      }
    }
  }
  return [...byId.values()];
}

/** One "waits for" link: `to` waits for `from`. */
export interface DepEdge {
  from: string;
  to: string;
}

/**
 * Every waits-for link the loaded data names: each item's whole `blockedBy`
 * (open and done blockers alike, so a link to a finished task still draws and
 * still counts for the loop check), inverted into holds too.
 */
export function dependencyEdges(items: readonly FlowItem[]): DepEdge[] {
  const out: DepEdge[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    for (const id of item.blockedBy) {
      const key = `${id}>${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ from: id, to: item.id });
    }
  }
  return out;
}

/** The selected task's links: what it waits for, and what waits for it. */
export function linksOf(id: string, edges: readonly DepEdge[]): { blockers: string[]; holds: string[] } {
  return {
    blockers: edges.filter((e) => e.to === id).map((e) => e.from),
    holds: edges.filter((e) => e.from === id).map((e) => e.to),
  };
}

/** Rows to dim while `selected` is chosen: all but it and its linked rows. Empty when nothing is selected. */
export function dimmedRows(rows: readonly LaneRow[], selected: string | null, edges: readonly DepEdge[]): Set<string> {
  if (!selected || !rows.some((r) => r.id === selected)) return new Set();
  const { blockers, holds } = linksOf(selected, edges);
  const keep = new Set([selected, ...blockers, ...holds]);
  return new Set(rows.filter((r) => !keep.has(r.id)).map((r) => r.id));
}

export interface Arrow {
  /** SVG path in lane units: x in 0..100 (% of the lane), y in px */
  d: string;
  /** where the arrowhead sits (the waiting bar's start), x in 0..100, y in px */
  head: { x: number; y: number };
  from: string;
  to: string;
}

/** How far (in % of the lane) a connector runs out of a bar before it turns. */
const ELBOW = 1.5;

/**
 * Elbow connector from the end of a blocker's bar to the start of the bar
 * waiting for it. When the waiting bar starts left of where the line turns,
 * the line drops into the gap above (or below) the waiting row first and
 * comes in from its left, so it never runs back across a bar.
 */
export function elbowPath(
  from: { x1: number; y: number },
  to: { x0: number; y: number; top: number; bottom: number },
  /** come in through the gap even when there is room: the waiting row's words sit before its bar */
  viaGap = false,
): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  const out = Math.min(100, from.x1 * 100 + ELBOW);
  const x0 = to.x0 * 100;
  if (!viaGap && x0 >= out + ELBOW) return `M${r(from.x1 * 100)} ${r(from.y)}H${r(out)}V${r(to.y)}H${r(x0)}`;
  const gapY = to.y > from.y ? to.top - LANE_GAP / 2 : to.bottom + LANE_GAP / 2;
  const back = Math.max(0, x0 - ELBOW);
  return `M${r(from.x1 * 100)} ${r(from.y)}H${r(out)}V${r(gapY)}H${r(back)}V${r(to.y)}H${r(x0)}`;
}

/**
 * The connectors for the selected task: from each blocker on screen to it,
 * and from it to each task on screen that waits for it. `runwayFor` gives a
 * row's bar. Links to tasks not on screen are left to `offscreenBlockers`.
 */
export function dependencyArrows(
  rows: readonly LaneRow[],
  selected: string | null,
  edges: readonly DepEdge[],
  runwayFor: (row: LaneRow) => Runway,
): Arrow[] {
  if (!selected) return [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (!byId.has(selected)) return [];
  const { blockers, holds } = linksOf(selected, edges);
  const out: Arrow[] = [];
  const add = (fromId: string, toId: string) => {
    const a = byId.get(fromId);
    const b = byId.get(toId);
    if (!a || !b || a === b) return;
    const ra = runwayFor(a);
    const rb = runwayFor(b);
    const ya = a.top + a.height / 2;
    const yb = b.top + b.height / 2;
    out.push({
      d: elbowPath(
        { x1: ra.x1, y: ya },
        { x0: rb.x0, y: yb, top: b.top, bottom: b.top + b.height },
        runwayLabelSide(rb) === "before",
      ),
      head: { x: rb.x0 * 100, y: yb },
      from: fromId,
      to: toId,
    });
  };
  for (const b of blockers) add(b, selected);
  for (const h of holds) add(selected, h);
  return out;
}

/** The selected row's blockers that are not on screen, for its "waits: …" label. */
export function offscreenBlockers(
  rows: readonly LaneRow[],
  selected: string | null,
  items: readonly FlowItem[],
): { id: string; title: string }[] {
  if (!selected) return [];
  const row = rows.find((r) => r.id === selected);
  if (!row) return [];
  const onScreen = new Set(rows.map((r) => r.id));
  const own = items.find((i) => i.id === selected)?.waitingOn ?? [];
  return own.filter((b) => !onScreen.has(b.id));
}

export interface WaitCandidate {
  id: string;
  title: string;
  /** where it lives: its stream, or "stream › parent" for a subtask */
  context: string;
  disabled: "added" | "loop" | null;
}

/**
 * Tasks the edited one could wait for, matching `query`: every loaded task
 * and open subtask but itself, with those already added or that would make a
 * loop (they already wait for it, directly or through others) disabled.
 * `knownWaiters` are the ids `get_task` says wait for it directly (its full
 * list; the streams name only a few blockers per task).
 */
export function waitCandidates(
  selfId: string | null,
  items: readonly FlowItem[],
  added: readonly string[],
  knownWaiters: readonly string[],
  query: string,
  limit = 8,
): WaitCandidate[] {
  const edges = dependencyEdges(items);
  // Everything that (transitively) waits for self.
  const waiting = new Set<string>();
  if (selfId) {
    const stack = [...knownWaiters, ...edges.filter((e) => e.from === selfId).map((e) => e.to)];
    while (stack.length) {
      const id = stack.pop() as string;
      if (waiting.has(id) || id === selfId) continue;
      waiting.add(id);
      for (const e of edges) if (e.from === id) stack.push(e.to);
    }
  }
  const q = query.trim().toLocaleLowerCase();
  const out: WaitCandidate[] = [];
  // Top-level tasks first, then subtasks; each in listing order.
  const ordered = [...items.filter((i) => !i.under), ...items.filter((i) => i.under)];
  for (const item of ordered) {
    if (item.id === selfId || item.done) continue;
    if (q && !item.title.toLocaleLowerCase().includes(q)) continue;
    out.push({
      id: item.id,
      title: item.title,
      context: item.under ? `${item.stream} › ${item.under}` : item.stream,
      disabled: added.includes(item.id) ? "added" : waiting.has(item.id) ? "loop" : null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** `blockedBy` for update_task when the chosen set differs from the saved one; undefined when it does not. */
export function blockedByPatch(saved: readonly string[], chosen: readonly string[]): string[] | undefined {
  const a = [...new Set(saved)].sort();
  const b = [...new Set(chosen)].sort();
  return a.join(",") === b.join(",") ? undefined : [...new Set(chosen)];
}
