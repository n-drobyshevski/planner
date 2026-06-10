-- Planner — task due dates become zone-free calendar dates.
-- The UI only ever captures a bare date ("do by this day"), but due_at stored
-- an instant baked from the creator's time zone, so viewers in other zones
-- could see the date shift by a day. A `date` column is the same token for
-- every viewer; "overdue" is computed against the viewer's zone at render
-- (mirrors the floating all-day event pattern, lib/datetime/local.ts).
--
-- Backfill caveat: legacy instants are read back as their UTC calendar date.
-- Rows created in a negative-offset zone may land one day late — a one-time,
-- acceptable shift for this app.

alter table tasks add column due_date date;
update tasks set due_date = (due_at at time zone 'UTC')::date where due_at is not null;
alter table tasks drop column due_at;
