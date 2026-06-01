# Weekday selection for Daily recurrences

**Date:** 2026-06-01
**Status:** Approved (design)

## Problem

Recurring events can already be restricted to specific weekdays, but only when
the repeat frequency is **Weekly**. Selecting **Daily** repeats every day with
no way to limit it to, say, Mon/Wed/Fri or weekdays only. Users want to pick
exact weekdays under Daily as well (e.g. a "standup every weekday", "gym on
Mon/Wed/Fri").

## Goal

When Repeat is set to **Daily**, show the same "On days" weekday toggles that
Weekly already has, and have the selection drive which occurrences appear.

Non-goals: monthly weekday rules (e.g. "3rd Tuesday"), per-occurrence weekday
overrides, a separate "Weekdays (Mon–Fri)" preset in the Repeat dropdown.

## Semantics

`FREQ=DAILY;BYDAY=MO,WE,FR` and `FREQ=WEEKLY;BYDAY=MO,WE,FR` expand to the same
occurrences when `INTERVAL=1` — both mean "on these weekdays, every week". They
diverge only when `INTERVAL>1`: a daily interval drifts irregularly ("every 2nd
day, but only if it lands on a Monday"), which is a footgun nobody wants.

**Decision:** under Daily, the weekday toggles act as a filter. When **no** days
are selected the event is "every day" and behaves exactly as today — the "Every
N days" interval is shown and honored. As soon as **any** day is selected
(one or more), the interval is **hidden and treated as 1**: restricting to
specific weekdays implies a weekly cadence. The boundary is simply
`byWeekday.length > 0`, not "is it a strict subset" — selecting all seven is an
odd no-op the user can undo by clearing the toggles, and it harmlessly expands
to every day.

This means every emitted rule is unambiguous:
- Daily, no days selected → `FREQ=DAILY` (+ optional `INTERVAL`, `UNTIL`/`COUNT`).
- Daily, ≥1 day selected → `FREQ=DAILY;BYDAY=...` (no `INTERVAL`).

The form keeps its `interval` value while hidden, so clearing the day toggles
restores the previous interval rather than resetting to 1.

We keep `FREQ=DAILY` (rather than rewriting to `FREQ=WEEKLY`) so the dialog
reopens showing "Daily" with the days lit up — a clean round-trip.

## Touch points

### `components/event/recurrence-editor.tsx` (client component)
- `setFreq`: switching to `DAILY` leaves `byWeekday` empty (= every day), same
  default behavior as today. (Weekly still seeds the start day.)
- Render the existing "On days" `ToggleGroup` when freq is `WEEKLY` **or**
  `DAILY` (widen the current `=== "WEEKLY"` condition).
- Hide the "Every N days" interval input when freq is `DAILY` **and**
  `byWeekday.length > 0`.

### `lib/recurrence/rrule-build.ts` (pure helpers)
- `buildRRule`: emit `BYDAY=...` for `DAILY` as well as `WEEKLY`. When emitting
  `BYDAY` under `DAILY`, omit `INTERVAL` (force interval 1) per the decision
  above.
- `summarizeRecurrence`: include the day list for `DAILY` too, e.g. "Repeats
  daily on Mon, Wed, Fri".
- `parseRRule`: **no change** — it already reads `byweekday` for any frequency,
  so a stored `FREQ=DAILY;BYDAY=...` round-trips back to Daily with days set.

### `test/rrule-build.test.ts`
- `buildRRule`: Daily + weekdays → `FREQ=DAILY;BYDAY=...` with no `INTERVAL`.
- `buildRRule`: plain Daily (no days) unchanged, including with interval.
- Round-trip: `parseRRule(buildRRule(form))` preserves Daily + weekdays.
- `summarizeRecurrence`: Daily-with-days sentence.

## Out of scope / unchanged

- `expand.ts` — feeds the RRULE string straight to the `rrule` library, which
  handles `FREQ=DAILY;BYDAY` natively. No change.
- Database schema / migrations — `rrule` is a text column; no shape change.
- Edit-scope semantics (`this`/`future`/`all`) — unaffected.
