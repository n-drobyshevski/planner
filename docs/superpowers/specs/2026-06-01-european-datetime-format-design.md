# European date & time format (dd/mm/yyyy + 24-hour)

**Date:** 2026-06-01
**Status:** Approved (design)

## Problem

The app renders dates US-style ("Jun 1, 2026") and times in 12-hour AM/PM
("9:00 AM"). The event/recurrence/task dialogs use native `<input type="date">`
and `<input type="time">`, which render in the **browser's** locale — so on a
US-English browser they show `mm/dd/yyyy` and AM/PM regardless of app code. The
user wants European formatting throughout: **dd/mm/yyyy** dates and **24-hour**
time.

## Decisions (from clarification)

1. **Dialog inputs:** replace the native date/time inputs with custom in-app
   pickers so they always show `dd/MM/yyyy` and 24-hour, independent of browser
   locale.
2. **App-rendered text:** European **month-name order** with 24-hour time —
   e.g. "1 Jun 2026", "Mon, 1 Jun · 09:00 – 09:30", "June 2026". (Month names
   kept for readability; avoids ambiguous all-numeric dates in prose.)
3. Numeric `dd/MM/yyyy` is used in the **dialog input triggers** (matching the
   native field they replace); month-name order is used in **display text**.

## Architecture

### Two reusable input primitives

The dialog form state stays in ISO strings (`"yyyy-MM-dd"`, `"HH:mm"`), so only
the widgets change — `combineDateTime`, `dateInputToMs`, validation, and
`computeTimes()` in the dialogs are untouched.

**`components/ui/date-picker.tsx`** — Popover + existing `components/ui/calendar.tsx`
(react-day-picker). 
- Props: `value: string` (ISO `"yyyy-MM-dd"`, or `""`), `onChange: (v: string) => void`,
  plus optional `id`, `disabled`, `aria-label`, `className`.
- Trigger: a `Button` showing `format(parsed, "dd/MM/yyyy")` (or a placeholder
  when empty). Calendar selection emits back `format(date, "yyyy-MM-dd")`.
- Parse/format via date-fns; reuses the ISO string contract of the inputs it
  replaces.

**`components/ui/time-field.tsx`** — 24-hour text field.
- Props: `value: string` (`"HH:mm"`), `onChange: (v: string) => void`, plus
  optional `id`, `disabled`, `aria-label`, `className`.
- A controlled `Input` showing `HH:mm`. Accepts loose typing (`9:00`, `09:00`,
  `0900`); normalizes to `HH:mm` on blur; rejects/ignores invalid input
  (keeps last valid value). `inputMode="numeric"`.
- Tradeoff noted: loses the native mobile time wheel; gains forced 24-hour.

### Wiring (drop-in, same conditions)

Replace each native input with the matching primitive, preserving surrounding
layout, labels, `disabled`, and all-day gating:
- `components/event/event-dialog.tsx` — start date+time, end date+time (4 fields).
- `components/event/recurrence-editor.tsx` — until date (1).
- `components/tasks/schedule-task-dialog.tsx` — date + time (2).
- `components/tasks/task-dialog.tsx` — due date (1).

### App-rendered text → European month-name order + 24h

Centralize the common patterns in `lib/datetime/format.ts` (single source of
truth; no scattered pattern strings). Add:
- `formatTime(ms)` → `"HH:mm"`
- `formatDayMonth(ms)` → `"d MMM"`
- `formatWeekdayDayMonth(ms)` → `"EEE, d MMM"`
- `formatDayMonthYear(ms)` → `"d MMM yyyy"`

Update the two existing functions:
- `formatRangeLabel`: day → `"EEEE, d MMM yyyy"`; month/agenda → `"MMMM yyyy"`
  (unchanged); week/3day range → `"1 – 7 Jun 2026"` (same month) or
  `"29 Jun – 5 Jul 2026"` (cross-month).
- `formatOccurrenceWhen`: all-day one day → `"EEE, d MMM · All day"`; all-day
  multi → `"d MMM – d MMM"`; timed same day → `"EEE, d MMM · HH:mm – HH:mm"`;
  timed across days → `"d MMM, HH:mm – d MMM, HH:mm"`.

Swap inline US patterns to call the helpers:
- `event-block.tsx:96`, `context-backdrop.tsx:94` → `formatTime` (both sides).
- `agenda-view.tsx:200` → `formatTime`.
- `month-grid.tsx:272` → `formatWeekdayDayMonth`; `:292` → `formatTime`;
  `:95/:110` aria-labels → `"d MMMM"` order.
- `time-grid.tsx:139` → `formatTime`; hour gutter `:507` "h a" → 24h `"HH:mm"`
  (e.g. "09:00"), keeping the existing skip of the 0 label.
- `task-card.tsx:127`, `event-details.tsx:140` (`Due …`) → `formatDayMonth`.

### Explicitly unchanged
- ISO values: `msToDateInput` `"yyyy-MM-dd"` (picker value), `msToTimeInput`
  `"HH:mm"`, `toDateParam` `"yyyy-MM-dd"` (URL).
- Stacked agenda date column (`EEE` / `d` / `MMM`) and time-grid column headers
  (`EEE` / `d`) — no day/month-order ambiguity.
- Bare day numbers (`"d"`).
- No `date-fns/locale` import: the pattern string sets the order; `MMM` is
  English regardless of locale.

## Testing
- `test/format.test.ts`: extend with European assertions for `formatRangeLabel`
  (day / week same-month / week cross-month / month), `formatOccurrenceWhen`
  (all four branches), and the new `formatTime`/`formatDayMonth`/
  `formatWeekdayDayMonth`/`formatDayMonthYear` helpers. Use fixed local-time
  instants; assert on the formatted strings (24h, day-before-month).
- `test/date-picker.test.tsx` (new): renders, shows `dd/MM/yyyy` for an ISO
  value, empty value shows placeholder, selecting a day emits ISO `yyyy-MM-dd`.
- `test/time-field.test.tsx` (new): shows `HH:mm`; typing `9:5`/`0900`
  normalizes to `09:05`/`09:00` on blur; invalid input keeps the last value;
  24-hour display (no AM/PM).

## Verification
1. `pnpm test` green; `pnpm typecheck` clean; `pnpm lint` no new problems vs the
   `main` baseline.
2. Manual (`pnpm dev`): open the event dialog → date fields show `dd/MM/yyyy`
   via the calendar popover, time fields show 24-hour; create/edit round-trips
   correctly. View header, agenda, event blocks, occurrence details, task due
   dates all read European month-name order + 24-hour. Recurrence "until" and
   both task dialogs use the new pickers.
