-- Planner — task planned start date + milestone (point-in-time) flag.
--
-- start_date: an optional zone-free calendar date ("do this from this day"),
-- the same token for every viewer (mirrors due_date, 20260613). It anchors the
-- left edge of a task's trunk in the Flows view; null means "anchor to the
-- creation event" so every existing lane renders exactly as before. A future
-- start places the task to the right of the now-line.
--
-- is_milestone: marks a task as a single moment rather than a span. Flows draws
-- it as a point marker at its start instead of a trunk line.
--
-- Both inherit the task's existing RLS policy; no backfill needed.

alter table tasks add column start_date date;
alter table tasks add column is_milestone boolean not null default false;
