-- Planner — lifecycle "status" for events
-- Marks an event (or context) as cancelled / planned / confirmed so the calendar
-- can render its state: cancelled => diagonal grayed stripes, planned => dotted
-- outline, confirmed => plain fill (today's look). Event-level (applies to the
-- whole series); mirrors the existing `kind` enum + `inactive` boolean. Existing
-- rows default to 'confirmed', so no backfill is needed. No RLS change: the
-- column lives on `events`, already covered by the events policies.

create type event_status as enum ('cancelled', 'planned', 'confirmed');

alter table events add column status event_status not null default 'confirmed';
