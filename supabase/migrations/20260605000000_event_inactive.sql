-- Planner — "inactive" flag for events
-- Marks an event (or context) as background/context (e.g. sleep hours) so the
-- calendar renders it grayed out. Event-level (applies to the whole series);
-- mirrors the existing `all_day` boolean. Existing rows default to active (false).
-- No RLS change: the column lives on `events`, already covered by the events
-- policies. Ordered after the owner-centric `calendar_sharing` migration since
-- it touches the same table.

alter table events add column inactive boolean not null default false;
