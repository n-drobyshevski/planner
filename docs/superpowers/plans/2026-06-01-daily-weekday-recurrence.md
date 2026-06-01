# Daily Weekday Recurrence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Daily recurring event be restricted to specific weekdays (e.g. "every weekday", "Mon/Wed/Fri"), reusing the weekday toggles Weekly already has.

**Architecture:** Pure rule-string helpers (`buildRRule`/`summarizeRecurrence`) learn to emit/describe `BYDAY` for `DAILY`, dropping `INTERVAL` when a weekday filter is present (a daily filter is really a weekly cadence). The `RecurrenceEditor` client component shows the existing "On days" toggles for `DAILY` and hides the "Every N days" input once any day is picked. `parseRRule` and `expand.ts` already handle `FREQ=DAILY;BYDAY` and need no change. No DB migration.

**Tech Stack:** TypeScript, React 19, Next 16 (client component), `rrule`, Vitest + Testing Library (jsdom), pnpm.

**Spec:** `docs/superpowers/specs/2026-06-01-daily-weekday-recurrence-design.md`

---

## File Structure

- `lib/recurrence/rrule-build.ts` — **modify** `buildRRule` (lines 82-105) and `summarizeRecurrence` (lines 149-170). Pure functions; the heart of the behavior change.
- `test/rrule-build.test.ts` — **modify**: replace the now-obsolete "does not emit BYDAY for non-weekly" test (lines 143-151), add daily-with-days build/summary/round-trip/inverse cases.
- `components/event/recurrence-editor.tsx` — **modify**: widen the "On days" render condition to include `DAILY`; hide the interval input for daily-with-days.
- `test/recurrence-editor.test.tsx` — **create**: component test for the interval show/hide rule.

No changes to: `lib/recurrence/expand.ts`, `lib/recurrence/edit-semantics.ts`, `components/event/event-dialog.tsx`, `components/event/event-details.tsx`, DB migrations.

---

## Task 1: `buildRRule` emits BYDAY for Daily (and drops INTERVAL there)

**Files:**
- Modify: `lib/recurrence/rrule-build.ts:82-105`
- Test: `test/rrule-build.test.ts:143-151` (replace) + additions

- [ ] **Step 1: Replace the obsolete test with the new build behavior**

In `test/rrule-build.test.ts`, find this test (currently lines 143-151) inside the `describe("buildRRule", ...)` block:

```ts
  it("does not emit BYDAY for non-weekly even if byWeekday is set", () => {
    const form: RecurrenceForm = {
      freq: "DAILY",
      interval: 1,
      byWeekday: [0, 1],
      end: { type: "never" },
    };
    expect(buildRRule(form)).toBe("FREQ=DAILY");
  });
```

Replace it entirely with these three tests:

```ts
  it("daily with weekdays -> FREQ=DAILY;BYDAY (interval omitted)", () => {
    const form: RecurrenceForm = {
      freq: "DAILY",
      interval: 1,
      byWeekday: [0, 2, 4],
      end: { type: "never" },
    };
    expect(buildRRule(form)).toBe("FREQ=DAILY;BYDAY=MO,WE,FR");
  });

  it("daily with weekdays drops INTERVAL even when interval > 1", () => {
    const form: RecurrenceForm = {
      freq: "DAILY",
      interval: 3,
      byWeekday: [0],
      end: { type: "never" },
    };
    expect(buildRRule(form)).toBe("FREQ=DAILY;BYDAY=MO");
  });

  it("monthly does not emit BYDAY even if byWeekday is set", () => {
    const form: RecurrenceForm = {
      freq: "MONTHLY",
      interval: 1,
      byWeekday: [0, 1],
      end: { type: "never" },
    };
    expect(buildRRule(form)).toBe("FREQ=MONTHLY");
  });
```

- [ ] **Step 2: Run the tests to verify the first two fail**

Run: `pnpm test test/rrule-build.test.ts`
Expected: FAIL — "daily with weekdays -> FREQ=DAILY;BYDAY" and "drops INTERVAL" fail (current code returns `"FREQ=DAILY"` / `"FREQ=DAILY;INTERVAL=3"` because BYDAY is gated to `WEEKLY`). The "monthly does not emit BYDAY" test passes.

- [ ] **Step 3: Update `buildRRule`**

In `lib/recurrence/rrule-build.ts`, replace the whole `buildRRule` function (lines 82-105) with:

```ts
export function buildRRule(form: RecurrenceForm | null): string | null {
  if (form === null) return null;

  // BYDAY applies to weekly recurrences and to daily recurrences used as a
  // weekday filter ("every weekday", "Mon/Wed/Fri").
  const hasDays =
    (form.freq === "WEEKLY" || form.freq === "DAILY") && form.byWeekday.length > 0;

  const parts: string[] = [`FREQ=${form.freq}`];

  // A daily weekday filter is really a weekly cadence; INTERVAL would mean
  // "every N days" and drift off the chosen weekdays, so we omit it there.
  const emitInterval = form.interval > 1 && !(form.freq === "DAILY" && hasDays);
  if (emitInterval) {
    parts.push(`INTERVAL=${form.interval}`);
  }

  if (hasDays) {
    const days = [...form.byWeekday]
      .sort((a, b) => a - b)
      .map((idx) => WEEKDAYS[idx].toString());
    parts.push(`BYDAY=${days.join(",")}`);
  }

  if (form.end.type === "until") {
    parts.push(`UNTIL=${toUntilBasic(form.end.dateMs)}`);
  } else if (form.end.type === "count") {
    parts.push(`COUNT=${form.end.count}`);
  }

  return parts.join(";");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test test/rrule-build.test.ts`
Expected: PASS — all `buildRRule` tests green, including the weekly cases (weekly with interval still emits `INTERVAL` because `emitInterval` only suppresses it for `DAILY`+days) and the existing "daily with interval 2 -> FREQ=DAILY;INTERVAL=2" (no days, so `hasDays` is false and INTERVAL is kept).

- [ ] **Step 5: Commit**

```bash
git add lib/recurrence/rrule-build.ts test/rrule-build.test.ts
git commit -m "feat(recurrence): emit BYDAY for daily weekday filters"
```

---

## Task 2: `summarizeRecurrence` describes Daily weekdays

**Files:**
- Modify: `lib/recurrence/rrule-build.ts:149-170`
- Test: `test/rrule-build.test.ts` (additions in the `summarizeRecurrence` describe block)

- [ ] **Step 1: Add the failing summary tests**

In `test/rrule-build.test.ts`, inside `describe("summarizeRecurrence", ...)` (after the existing "monthly with a count" test, before the closing `});` near line 43), add:

```ts
  it("daily on specific weekdays", () => {
    expect(
      summarizeRecurrence({
        freq: "DAILY",
        interval: 1,
        byWeekday: [0, 2, 4],
        end: { type: "never" },
      }),
    ).toBe("Repeats daily on Mon, Wed, Fri");
  });

  it("daily on weekdays ignores interval in the summary", () => {
    expect(
      summarizeRecurrence({
        freq: "DAILY",
        interval: 3,
        byWeekday: [0],
        end: { type: "never" },
      }),
    ).toBe("Repeats daily on Mon");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test test/rrule-build.test.ts`
Expected: FAIL — current `summarizeRecurrence` only appends the day list for `WEEKLY`, so it returns "Repeats daily" / "Repeats every 3 days" without the " on Mon…" suffix.

- [ ] **Step 3: Update `summarizeRecurrence`**

In `lib/recurrence/rrule-build.ts`, replace the whole `summarizeRecurrence` function (lines 149-170) with:

```ts
/** Short human sentence for a recurrence form, e.g. "Repeats weekly on Mon, Wed, until Jun 30, 2026". */
export function summarizeRecurrence(form: RecurrenceForm): string {
  const hasDays =
    (form.freq === "WEEKLY" || form.freq === "DAILY") && form.byWeekday.length > 0;
  // Daily-with-days has no meaningful interval (see buildRRule): render it plain.
  const showInterval = form.interval > 1 && !(form.freq === "DAILY" && hasDays);

  let out = showInterval
    ? `Repeats every ${form.interval} ${FREQ_UNIT[form.freq]}s`
    : `Repeats ${FREQ_ADVERB[form.freq]}`;

  if (hasDays) {
    const days = [...form.byWeekday]
      .sort((a, b) => a - b)
      .map((i) => WEEKDAY_LABELS[i])
      .join(", ");
    out += ` on ${days}`;
  }

  if (form.end.type === "until") {
    out += `, until ${format(form.end.dateMs, "MMM d, yyyy")}`;
  } else if (form.end.type === "count") {
    out += `, ${form.end.count} times`;
  }

  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test test/rrule-build.test.ts`
Expected: PASS — including the existing "weekly on a single day", "every N weeks on multiple days", "daily with an until date" (empty `byWeekday` → `hasDays` false → "Repeats daily, until …"), and "monthly with a count".

- [ ] **Step 5: Commit**

```bash
git add lib/recurrence/rrule-build.ts test/rrule-build.test.ts
git commit -m "feat(recurrence): summarize daily weekday filters"
```

---

## Task 3: Round-trip + string-inverse coverage for Daily weekdays

**Files:**
- Test: `test/rrule-build.test.ts` (additions to the `round-trips` forms array and the `build -> parse inverse` strings array)

- [ ] **Step 1: Add a round-trip form and an inverse string**

In `test/rrule-build.test.ts`, in the `describe("round-trips", ...)` block, add this entry to the `forms` array (e.g. after the first DAILY entries near line 237):

```ts
    { freq: "DAILY", interval: 1, byWeekday: [0, 2, 4], end: { type: "never" } },
```

Then, in `describe("build -> parse inverse from the string side", ...)`, add this entry to the `strings` array (e.g. after `"FREQ=DAILY;INTERVAL=2"`):

```ts
    "FREQ=DAILY;BYDAY=MO,WE,FR",
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `pnpm test test/rrule-build.test.ts`
Expected: PASS. `parseRRule("FREQ=DAILY;BYDAY=MO,WE,FR")` already returns `{ freq: "DAILY", interval: 1, byWeekday: [0,2,4], end: { type: "never" } }` (parseRRule reads `byweekday` for any freq), and `buildRRule` now reproduces that exact string — so both `parse(build(x)) == x` and `build(parse(x)) == x` hold.

- [ ] **Step 3: Commit**

```bash
git add test/rrule-build.test.ts
git commit -m "test(recurrence): round-trip daily weekday rules"
```

---

## Task 4: RecurrenceEditor shows weekday toggles for Daily and hides interval

**Files:**
- Create: `test/recurrence-editor.test.tsx`
- Modify: `components/event/recurrence-editor.tsx` (interval block lines 70-83; "On days" condition line 85)

- [ ] **Step 1: Write the failing component test**

Create `test/recurrence-editor.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecurrenceEditor } from "@/components/event/recurrence-editor";
import type { RecurrenceForm } from "@/lib/recurrence/rrule-build";

const START = Date.UTC(2026, 5, 1, 9, 0, 0); // a Monday

describe("RecurrenceEditor — daily weekday filter", () => {
  it("daily with no days selected shows the interval input and weekday toggles", () => {
    const daily: RecurrenceForm = {
      freq: "DAILY",
      interval: 1,
      byWeekday: [],
      end: { type: "never" },
    };
    render(<RecurrenceEditor value={daily} onChange={vi.fn()} startMs={START} />);
    // "Every N day(s)" is a number input (implicit role spinbutton).
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
    // Weekday toggles are offered so the user can restrict days.
    expect(screen.getByRole("button", { name: "Mo" })).toBeInTheDocument();
  });

  it("daily with a weekday selected hides the interval input", () => {
    const dailyWithDays: RecurrenceForm = {
      freq: "DAILY",
      interval: 1,
      byWeekday: [0],
      end: { type: "never" },
    };
    render(<RecurrenceEditor value={dailyWithDays} onChange={vi.fn()} startMs={START} />);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByRole("button", { name: "Mo" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/recurrence-editor.test.tsx`
Expected: FAIL — both cases fail against current code: the first on `getByRole("button", { name: "Mo" })` (toggles aren't rendered for DAILY yet), and the second on `queryByRole("spinbutton")` being non-null (interval is always shown for DAILY today).

- [ ] **Step 3: Widen the "On days" render condition**

In `components/event/recurrence-editor.tsx`, change the opening of the weekday block (currently line 85):

```tsx
          {value.freq === "WEEKLY" && (
            <Field>
              <FieldLabel>On days</FieldLabel>
```

to:

```tsx
          {(value.freq === "WEEKLY" || value.freq === "DAILY") && (
            <Field>
              <FieldLabel>On days</FieldLabel>
```

- [ ] **Step 4: Hide the interval input for daily-with-days**

In the same file, wrap the interval `div` (currently lines 70-83). Replace:

```tsx
          <div className="flex items-end gap-2">
            <Field className="w-24">
              <FieldLabel>Every</FieldLabel>
              <Input
                type="number"
                min={1}
                value={value.interval}
                onChange={(e) =>
                  onChange({ ...value, interval: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </Field>
            <span className="pb-2.5 text-sm text-muted-foreground">{UNIT[value.freq]}</span>
          </div>
```

with:

```tsx
          {!(value.freq === "DAILY" && value.byWeekday.length > 0) && (
            <div className="flex items-end gap-2">
              <Field className="w-24">
                <FieldLabel>Every</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  value={value.interval}
                  onChange={(e) =>
                    onChange({ ...value, interval: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </Field>
              <span className="pb-2.5 text-sm text-muted-foreground">{UNIT[value.freq]}</span>
            </div>
          )}
```

(`setFreq` is unchanged: switching to `DAILY` already leaves `byWeekday` empty, i.e. "every day".)

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test test/recurrence-editor.test.tsx`
Expected: PASS — both cases green.

- [ ] **Step 6: Commit**

```bash
git add components/event/recurrence-editor.tsx test/recurrence-editor.test.tsx
git commit -m "feat(recurrence): weekday picker for daily events"
```

---

## Task 5: Full verification (suite, types, lint, manual)

**Files:** none (verification only)

- [ ] **Step 1: Run the whole unit suite**

Run: `pnpm test`
Expected: PASS — all files, no regressions in `expand`, `mappers`, `edit-semantics`, etc.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors. (The editor change adds no hooks/effects, so the react-hooks v6 rules that gate `next build` are not affected.)

- [ ] **Step 4: Manual check in the running app**

Run: `pnpm dev`, open the app, create a new event:
- Set **Repeat → Daily**. Confirm the "On days" toggles now appear and "Every N days" is visible.
- Click **Mo**, **We**, **Fr**. Confirm "Every N days" disappears.
- Save. Confirm the calendar shows occurrences only on Mon/Wed/Fri.
- Reopen the event (details panel) — confirm the summary reads "Repeats daily on Mon, Wed, Fri".
- Edit the event — confirm Repeat still shows **Daily** with Mo/We/Fr lit and the interval hidden.
- Clear all day toggles — confirm "Every N days" reappears.

Expected: all behaviors as described.

- [ ] **Step 5: Commit any incidental fixes**

If steps 1-4 surfaced fixes, commit them with a clear message. Otherwise nothing to commit.

---

## Notes for the implementer

- Run a single test file with a path filter: `pnpm test test/rrule-build.test.ts`. `pnpm test` alone runs everything once (`vitest run`).
- The weekday index convention is `0=Mon … 6=Sun` throughout (`rrule`'s `Weekday.weekday`). Don't introduce a Sunday-first index.
- Do **not** change `parseRRule` — it already normalizes `byweekday` for any frequency, which is exactly what makes the round-trip work.
- Per `AGENTS.md`, this Next 16 repo can diverge from older conventions, but this change touches only a `"use client"` component and pure helpers — no Next.js API surface (routing, server components, data fetching). No docs lookup required.
