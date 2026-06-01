# European date & time format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render all dates day-before-month with month names ("1 Jun 2026") and all times in 24-hour ("09:00"), and replace the dialogs' native date/time inputs with custom `dd/MM/yyyy` + 24-hour pickers.

**Architecture:** Centralize display patterns in `lib/datetime/format.ts` (new `formatTime`/`formatDayMonth`/`formatWeekdayDayMonth`/`formatDayMonthYear` + reordered `formatRangeLabel`/`formatOccurrenceWhen`); components call those helpers instead of inline date-fns patterns. Add two reusable widgets — `DatePicker` (Popover + existing `ui/calendar.tsx`, ISO `yyyy-MM-dd` in/out, shows `dd/MM/yyyy`) and `TimeField` (24-hour text field, `HH:mm` in/out) — and drop them into the four dialogs in place of native inputs. Dialog form state stays in ISO strings, so combine/validate logic is untouched.

**Tech Stack:** TypeScript, React 19, Next 16, date-fns, react-day-picker (via `components/ui/calendar.tsx`), Radix Popover, Vitest + Testing Library (jsdom), pnpm.

**Spec:** `docs/superpowers/specs/2026-06-01-european-datetime-format-design.md`

---

## File Structure

- `lib/datetime/format.ts` — **modify**: add four formatter helpers; reorder `formatRangeLabel` + `formatOccurrenceWhen` to European month-name order + 24h. Single source of truth.
- `test/format.test.ts` — **modify**: update existing assertions to European strings; add helper tests.
- `components/calendar/{event-block,context-backdrop,agenda-view,month-grid,time-grid}.tsx`, `components/tasks/task-card.tsx`, `components/event/event-details.tsx` — **modify**: swap inline US patterns to helpers / 24h.
- `components/ui/time-field.tsx` — **create**: `TimeField` + exported pure `normalizeTime`.
- `test/time-field.test.tsx` — **create**.
- `components/ui/date-picker.tsx` — **create**: `DatePicker`.
- `test/date-picker.test.tsx` — **create**.
- `components/event/event-dialog.tsx`, `components/event/recurrence-editor.tsx`, `components/tasks/schedule-task-dialog.tsx`, `components/tasks/task-dialog.tsx` — **modify**: replace native inputs with `DatePicker`/`TimeField`.

---

## Task 1: European display formatters

**Files:**
- Modify: `lib/datetime/format.ts`
- Test: `test/format.test.ts`

- [ ] **Step 1: Update existing assertions + add helper tests (these now fail)**

In `test/format.test.ts`, update the import to add the new helpers:

```ts
import {
  formatRangeLabel,
  formatOccurrenceWhen,
  formatTime,
  formatDayMonth,
  formatWeekdayDayMonth,
  formatDayMonthYear,
  parseViewParam,
  isCalendarViewParam,
} from "@/lib/datetime/format";
```

Replace the four `formatOccurrenceWhen` assertions' expected strings:

```ts
    expect(formatOccurrenceWhen(start, end, true)).toBe("Mon, 1 Jun · All day");
```
```ts
    expect(formatOccurrenceWhen(start, end, true)).toBe("1 Jun – 4 Jun");
```
```ts
    expect(formatOccurrenceWhen(start, end, false)).toBe("Mon, 1 Jun · 09:00 – 09:30");
```
```ts
    expect(formatOccurrenceWhen(start, end, false)).toBe("1 Jun, 23:00 – 2 Jun, 01:00");
```

Replace the four `formatRangeLabel` assertions' expected strings:

```ts
    expect(formatRangeLabel("day", focused)).toBe("Sunday, 31 May 2026");
```
```ts
    expect(formatRangeLabel("month", focused)).toBe("May 2026");
```
```ts
    expect(formatRangeLabel("week", focused)).toBe("25 – 31 May 2026");
```
```ts
    expect(formatRangeLabel("3day", focused)).toBe("31 May – 2 Jun 2026");
```

Add a new describe block for the helpers:

```ts
describe("formatters", () => {
  it("formatTime is 24-hour HH:mm", () => {
    expect(formatTime(new Date(2026, 5, 1, 9, 0).getTime())).toBe("09:00");
    expect(formatTime(new Date(2026, 5, 1, 18, 5).getTime())).toBe("18:05");
  });
  it("formatDayMonth is day-before-month", () => {
    expect(formatDayMonth(new Date(2026, 5, 1).getTime())).toBe("1 Jun");
  });
  it("formatWeekdayDayMonth", () => {
    expect(formatWeekdayDayMonth(new Date(2026, 5, 1).getTime())).toBe("Mon, 1 Jun");
  });
  it("formatDayMonthYear", () => {
    expect(formatDayMonthYear(new Date(2026, 5, 1).getTime())).toBe("1 Jun 2026");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test test/format.test.ts`
Expected: FAIL — old US strings no longer match; helper functions are not exported yet.

- [ ] **Step 3: Implement the helpers and reorder the two functions**

In `lib/datetime/format.ts`, add the four helpers (after the imports, before `formatRangeLabel`):

```ts
/** 24-hour time, e.g. "09:00". */
export function formatTime(ms: number): string {
  return format(ms, "HH:mm");
}

/** Day then month, e.g. "1 Jun". */
export function formatDayMonth(ms: number): string {
  return format(ms, "d MMM");
}

/** Weekday, day, month, e.g. "Mon, 1 Jun". */
export function formatWeekdayDayMonth(ms: number): string {
  return format(ms, "EEE, d MMM");
}

/** Day, month, year, e.g. "1 Jun 2026". */
export function formatDayMonthYear(ms: number): string {
  return format(ms, "d MMM yyyy");
}
```

Replace the body of `formatRangeLabel` with:

```ts
export function formatRangeLabel(view: CalendarView, focusedMs: number): string {
  if (view === "day") return format(focusedMs, "EEEE, d MMM yyyy");
  if (view === "month") return format(focusedMs, "MMMM yyyy");
  // Agenda is a rolling list from the focused day — label it by that month.
  if (view === "agenda") return format(focusedMs, "MMMM yyyy");

  // Range views (week, 3day): span the actual visible days, day-before-month.
  const days = getVisibleDays(view, focusedMs);
  const start = days[0];
  const end = days[days.length - 1];
  const sameMonth = format(start, "MMM yyyy") === format(end, "MMM yyyy");
  const left = sameMonth ? format(start, "d") : format(start, "d MMM");
  const right = format(end, "d MMM yyyy");
  return `${left} – ${right}`;
}
```

Replace the body of `formatOccurrenceWhen` with:

```ts
export function formatOccurrenceWhen(
  start: number,
  end: number,
  allDay: boolean,
): string {
  if (allDay) {
    const lastDay = end - 1; // exclusive end → inclusive last day
    return isSameDay(start, lastDay)
      ? `${formatWeekdayDayMonth(start)} · All day`
      : `${formatDayMonth(start)} – ${formatDayMonth(lastDay)}`;
  }
  if (isSameDay(start, end)) {
    return `${formatWeekdayDayMonth(start)} · ${formatTime(start)} – ${formatTime(end)}`;
  }
  return `${formatDayMonth(start)}, ${formatTime(start)} – ${formatDayMonth(end)}, ${formatTime(end)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test test/format.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add lib/datetime/format.ts test/format.test.ts
git commit -m "feat(datetime): European month-name + 24h display formatters"
```

---

## Task 2: Swap inline US patterns in components to helpers / 24h

**Files (modify):** `components/calendar/event-block.tsx`, `components/calendar/context-backdrop.tsx`, `components/calendar/agenda-view.tsx`, `components/calendar/month-grid.tsx`, `components/calendar/time-grid.tsx`, `components/tasks/task-card.tsx`, `components/event/event-details.tsx`

No new unit tests (presentation swaps calling Task 1's tested helpers); verified by typecheck + the format suite + manual. Make each edit, then typecheck.

- [ ] **Step 1: `event-block.tsx`** — replace the time range at line ~96:

Change `{format(occ.start, "h:mm")}–{format(occ.end, "h:mm a")}` to `{formatTime(occ.start)}–{formatTime(occ.end)}`. Replace the `import { format } from "date-fns";` line with `import { formatTime } from "@/lib/datetime/format";` (if `format` is used nowhere else in the file — confirm with a search; it is the only use).

- [ ] **Step 2: `context-backdrop.tsx`** — same change at line ~94:

Change `{format(occ.start, "h:mm")}–{format(occ.end, "h:mm a")}` to `{formatTime(occ.start)}–{formatTime(occ.end)}`. Swap the date-fns `format` import for `import { formatTime } from "@/lib/datetime/format";` (confirm `format` has no other use in the file).

- [ ] **Step 3: `agenda-view.tsx`** — replace only the event time at line ~200:

Change `format(occ.start, "h:mm a")` to `formatTime(occ.start)`. Keep the existing `format` import (still used for the stacked `EEE`/`d`/`MMM` date column at lines ~89/97/100). Add `import { formatTime } from "@/lib/datetime/format";` (the file already imports `groupByDay` from `@/lib/calendar/agenda` — add the new import alongside the other imports).

- [ ] **Step 4: `month-grid.tsx`** — four edits, keep the date-fns `format` import:

1. Line ~95 aria-label: `Create event on ${format(d, "MMMM d")}` → `Create event on ${format(d, "d MMMM")}`.
2. Line ~110 aria-label: `Go to ${format(d, "MMMM d")}` → `Go to ${format(d, "d MMMM")}`.
3. Line ~272 popover header: `{format(day, "EEEE, MMM d")}` → `{format(day, "EEEE, d MMM")}`.
4. Line ~292 event time: `{format(o.start, "h:mm a")}` → `{formatTime(o.start)}`.

Add `import { formatTime } from "@/lib/datetime/format";`. Keep `import { format, isSameMonth } from "date-fns";` (still used for `d`, `d MMMM`, `EEEE, d MMM`).

- [ ] **Step 5: `time-grid.tsx`** — two edits, keep the date-fns `format` import:

1. Line ~139 drag preview: `format(days[dayIndex] + min * 60_000, "h:mm")` → `formatTime(days[dayIndex] + min * 60_000)`.
2. Line ~507 hour gutter: `h === 0 ? "" : format(new Date(2000, 0, 1, h), "h a")` → `h === 0 ? "" : format(new Date(2000, 0, 1, h), "HH:mm")`.

Add `import { formatTime } from "@/lib/datetime/format";`. Keep the date-fns `format` import (used at lines ~435/443/507 for `EEE`, `d`, `HH:mm`).

- [ ] **Step 6: `task-card.tsx`** — line ~127:

Change `{format(task.dueAt, "MMM d")}` → `{formatDayMonth(task.dueAt)}`. Swap the date-fns `format` import for `import { formatDayMonth } from "@/lib/datetime/format";` (confirm `format` is unused elsewhere in the file; line 127 is its only use).

- [ ] **Step 7: `event-details.tsx`** — line ~140:

Change `Due {format(task.dueAt, "MMM d")}` → `Due {formatDayMonth(task.dueAt)}`. Remove `import { format } from "date-fns";` (line ~3; its only use is line 140). Add `formatDayMonth` to the existing format import: change `import { parseRRule, summarizeRecurrence } from "@/lib/recurrence/rrule-build";`-adjacent line `import { formatOccurrenceWhen } from "@/lib/datetime/format";` to `import { formatOccurrenceWhen, formatDayMonth } from "@/lib/datetime/format";`.

- [ ] **Step 8: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no errors (catches any leftover/unused `format` import).

```bash
git add components/calendar/event-block.tsx components/calendar/context-backdrop.tsx components/calendar/agenda-view.tsx components/calendar/month-grid.tsx components/calendar/time-grid.tsx components/tasks/task-card.tsx components/event/event-details.tsx
git commit -m "feat(calendar): European date + 24h time in all displays"
```

---

## Task 3: TimeField (24-hour) + normalizeTime

**Files:**
- Create: `components/ui/time-field.tsx`
- Test: `test/time-field.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `test/time-field.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimeField, normalizeTime } from "@/components/ui/time-field";

describe("normalizeTime", () => {
  it("normalizes loose input to HH:mm", () => {
    expect(normalizeTime("9")).toBe("09:00");
    expect(normalizeTime("9:5")).toBe("09:05");
    expect(normalizeTime("900")).toBe("09:00");
    expect(normalizeTime("0900")).toBe("09:00");
    expect(normalizeTime("23:59")).toBe("23:59");
    expect(normalizeTime(" 7:30 ")).toBe("07:30");
  });
  it("rejects invalid input", () => {
    expect(normalizeTime("24:00")).toBeNull();
    expect(normalizeTime("12:60")).toBeNull();
    expect(normalizeTime("abc")).toBeNull();
    expect(normalizeTime("")).toBeNull();
  });
});

describe("TimeField", () => {
  it("shows the 24-hour value", () => {
    render(<TimeField value="09:00" onChange={vi.fn()} aria-label="Start time" />);
    expect(screen.getByLabelText("Start time")).toHaveValue("09:00");
  });
  it("normalizes and emits on blur when the value changes", () => {
    const onChange = vi.fn();
    render(<TimeField value="08:00" onChange={onChange} aria-label="t" />);
    const input = screen.getByLabelText("t");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "0900" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("09:00");
  });

  it("does not emit when the normalized value is unchanged", () => {
    const onChange = vi.fn();
    render(<TimeField value="09:00" onChange={onChange} aria-label="t" />);
    const input = screen.getByLabelText("t");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "0900" } }); // normalizes to 09:00 == value
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });
  it("reverts invalid input on blur without calling onChange", () => {
    const onChange = vi.fn();
    render(<TimeField value="09:00" onChange={onChange} aria-label="t" />);
    const input = screen.getByLabelText("t");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "99:99" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("09:00");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test test/time-field.test.tsx`
Expected: FAIL — module `@/components/ui/time-field` does not exist.

- [ ] **Step 3: Implement `components/ui/time-field.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Normalize loose 24-hour input to "HH:mm"; null if unparseable. */
export function normalizeTime(raw: string): string | null {
  const s = raw.trim();
  let h: number;
  let m: number;
  const colon = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  const digits = /^(\d{3,4})$/.exec(s);
  const hourOnly = /^(\d{1,2})$/.exec(s);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else if (digits) {
    const d = digits[1].padStart(4, "0");
    h = Number(d.slice(0, 2));
    m = Number(d.slice(2));
  } else if (hourOnly) {
    h = Number(hourOnly[1]);
    m = 0;
  } else {
    return null;
  }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Controlled 24-hour time field; value/onChange use "HH:mm". */
export function TimeField({
  value,
  onChange,
  id,
  disabled,
  "aria-label": ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
}) {
  // While editing, hold the raw draft; otherwise display the controlled value.
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? value;

  function commit() {
    const norm = normalizeTime(draft ?? value);
    if (norm && norm !== value) onChange(norm);
    setDraft(null);
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      placeholder="hh:mm"
      disabled={disabled}
      aria-label={ariaLabel}
      value={display}
      onFocus={() => setDraft(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn("tabular-nums", className)}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test test/time-field.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/time-field.tsx test/time-field.test.tsx
git commit -m "feat(ui): 24-hour TimeField with loose-input normalization"
```

---

## Task 4: DatePicker (dd/MM/yyyy)

**Files:**
- Create: `components/ui/date-picker.tsx`
- Test: `test/date-picker.test.tsx`

The Popover-open + day-select + clear paths render react-day-picker in a Radix portal, which is flaky under jsdom; automated coverage here is the deterministic **display** direction, and select/clear are covered by manual QA in Task 6.

- [ ] **Step 1: Write failing tests**

Create `test/date-picker.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DatePicker } from "@/components/ui/date-picker";

describe("DatePicker", () => {
  it("shows the ISO value as dd/MM/yyyy", () => {
    render(<DatePicker value="2026-06-01" onChange={vi.fn()} aria-label="Start date" />);
    expect(screen.getByRole("button", { name: "Start date" })).toHaveTextContent("01/06/2026");
  });
  it("shows the placeholder when empty", () => {
    render(<DatePicker value="" onChange={vi.fn()} aria-label="Due date" />);
    expect(screen.getByRole("button", { name: "Due date" })).toHaveTextContent("dd/mm/yyyy");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test test/date-picker.test.tsx`
Expected: FAIL — module `@/components/ui/date-picker` does not exist.

- [ ] **Step 3: Implement `components/ui/date-picker.tsx`**

```tsx
"use client";

import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function parseIso(value: string): Date | undefined {
  if (!value) return undefined;
  const d = parse(value, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

/** Date picker showing dd/MM/yyyy; value/onChange use ISO "yyyy-MM-dd" ("" = empty). */
export function DatePicker({
  value,
  onChange,
  id,
  disabled,
  clearable = false,
  placeholder = "dd/mm/yyyy",
  "aria-label": ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  clearable?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
}) {
  const selected = parseIso(value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "w-full justify-start font-normal tabular-nums",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon data-icon="inline-start" />
          {selected ? format(selected, "dd/MM/yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          weekStartsOn={1}
          autoFocus
          onSelect={(d) => {
            if (d) onChange(format(d, "yyyy-MM-dd"));
          }}
        />
        {clearable && value && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => onChange("")}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test test/date-picker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/date-picker.tsx test/date-picker.test.tsx
git commit -m "feat(ui): dd/MM/yyyy DatePicker (Popover + Calendar)"
```

---

## Task 5: Wire pickers into the four dialogs

**Files (modify):** `components/event/event-dialog.tsx`, `components/event/recurrence-editor.tsx`, `components/tasks/schedule-task-dialog.tsx`, `components/tasks/task-dialog.tsx`

Form state stays in ISO strings; only the widgets change. Keep each surrounding `<Field>`/`<FieldLabel>` and any `!form.allDay` gating exactly as-is.

- [ ] **Step 1: `event-dialog.tsx`** — add imports and replace the 4 inputs:

Add near the other component imports:
```tsx
import { DatePicker } from "@/components/ui/date-picker";
import { TimeField } from "@/components/ui/time-field";
```
Replace the start-date `<Input type="date" .../>` (line ~372-376) with:
```tsx
                <DatePicker
                  value={form.startDate}
                  onChange={(v) => set("startDate", v)}
                  aria-label="Start date"
                />
```
Replace the start-time `<Input type="time" .../>` (line ~381-385) with:
```tsx
                  <TimeField
                    value={form.startTime}
                    onChange={(v) => set("startTime", v)}
                    aria-label="Start time"
                  />
```
Replace the end-date `<Input type="date" .../>` (line ~393-397) with:
```tsx
                <DatePicker
                  value={form.endDate}
                  onChange={(v) => set("endDate", v)}
                  aria-label="End date"
                />
```
Replace the end-time `<Input type="time" .../>` (line ~402-406) with:
```tsx
                  <TimeField
                    value={form.endTime}
                    onChange={(v) => set("endTime", v)}
                    aria-label="End time"
                  />
```
(Keep the `Input` import — still used for the title field.)

- [ ] **Step 2: `recurrence-editor.tsx`** — add import and replace the until-date input:

Add `import { DatePicker } from "@/components/ui/date-picker";`. Replace the until `<Input type="date" .../>` (line ~143-151) with:
```tsx
                <DatePicker
                  value={msToDateInput(value.end.dateMs)}
                  onChange={(v) =>
                    onChange({ ...value, end: { type: "until", dateMs: dateInputToMs(v) } })
                  }
                  aria-label="Repeat until date"
                  className="w-40"
                />
```
(`msToDateInput`/`dateInputToMs` are already imported. Keep the `Input` import — still used for the interval number field.)

- [ ] **Step 3: `schedule-task-dialog.tsx`** — add imports and replace the date + time inputs:

Add `import { DatePicker } from "@/components/ui/date-picker";` and `import { TimeField } from "@/components/ui/time-field";`. Replace the date `<Input id="sched-date" type="date" .../>` (line ~143-148) with:
```tsx
              <DatePicker
                id="sched-date"
                value={date}
                onChange={setDate}
                aria-label="Date"
              />
```
Replace the time `<Input id="sched-time" type="time" .../>` (line ~152-157) with:
```tsx
              <TimeField
                id="sched-time"
                value={time}
                onChange={setTime}
                aria-label="Start"
              />
```
(Keep the `Input` import if used elsewhere in the file; if not, remove it — verify and let typecheck/lint confirm.)

- [ ] **Step 4: `task-dialog.tsx`** — add import and replace the due-date input (clearable, since due date is optional):

Add `import { DatePicker } from "@/components/ui/date-picker";`. Replace the due `<Input id="task-due" type="date" .../>` (line ~242-247) with:
```tsx
                <DatePicker
                  id="task-due"
                  value={form.dueDate}
                  onChange={(v) => set("dueDate", v)}
                  clearable
                  aria-label="Due date"
                />
```
(Keep the `Input` import — still used for the title field.)

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add components/event/event-dialog.tsx components/event/recurrence-editor.tsx components/tasks/schedule-task-dialog.tsx components/tasks/task-dialog.tsx
git commit -m "feat(dialogs): dd/MM/yyyy + 24h pickers in event/recurrence/task dialogs"
```

---

## Task 6: Verify (suite, types, lint, manual)

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: PASS — all files, including the updated `format` suite and new `time-field`/`date-picker` tests.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors attributable to the changed files. (The react-hooks-v6 warnings are a pre-existing, `.next`-cache-dependent flake — compare the changed files with `pnpm exec eslint <changed files>` to confirm they add nothing.)

- [ ] **Step 4: Manual check (`pnpm dev`)**

- View header / week range / day header read European (e.g. "1 – 7 Jun 2026", "Monday, 1 Jun 2026").
- Event blocks, context backdrops, agenda rows, month "+N more" popover, time-grid hour gutter all show 24-hour (e.g. "09:00", not "9 AM").
- Occurrence details panel shows "Mon, 1 Jun · 09:00 – 09:30"; task due dates show "1 Jun".
- Event dialog: start/end date fields open a calendar and display dd/MM/yyyy; time fields are 24-hour text and normalize on blur (type "0900" → "09:00"); create + edit round-trip the correct instants.
- Recurrence "until" date and the two task dialogs use the new pickers; task due date can be cleared.

- [ ] **Step 5: Commit any incidental fixes** (otherwise nothing to commit).

---

## Notes for the implementer
- Run one test file with a path filter: `pnpm test test/format.test.ts`. `pnpm test` runs all.
- The order is day-before-month and 24-hour everywhere; **the date-fns pattern string sets the order** — no `date-fns/locale` import is needed, and `MMM`/`MMMM` stay English.
- Do not change ISO contracts: input values stay `"yyyy-MM-dd"` (`msToDateInput`) and `"HH:mm"` (`msToTimeInput`); URL param stays `toDateParam` `"yyyy-MM-dd"`. The pickers consume/emit exactly these strings, so dialog combine/validate logic is untouched.
- Per `AGENTS.md` (Next 16), these are client components + pure helpers — no Next.js API surface (routing/server/data) is touched.
