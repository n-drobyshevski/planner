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
