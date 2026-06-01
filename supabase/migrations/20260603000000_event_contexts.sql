-- Planner — event context placeholders ("time-block containers").
--
-- A "context" is a calendar time-block (e.g. a "Work" 9–5 block) that visually
-- groups the events / scheduled task-blocks stacked inside it. A context is
-- structurally an event (time range, color, title, scope/visibility, owner,
-- rrule), so we model it on the existing `events` table via a `kind`
-- discriminator rather than a separate table — the existing RLS, realtime
-- publication, window query, and recurrence expansion all cover it for free.
--
-- Membership has two layers:
--   * Visual nesting in the time grid is overlap-based (an event inside a
--     context's time range renders on top of its backdrop) and needs no column.
--   * `context_id` is an OPTIONAL stored hint (set by the assignment UIs) used
--     for grouping / tinting / agenda. It points at the context's master event.

create type event_kind as enum ('event', 'context');

alter table events
  add column kind event_kind not null default 'event',
  add column context_id uuid references events(id) on delete set null;

-- Speeds up "children of this context" lookups; partial since most rows are null.
create index events_context_idx on events(context_id) where context_id is not null;

-- No nesting: a context never carries a context_id (kind = 'context' => null).
alter table events
  add constraint events_context_not_nested
  check (kind = 'event' or context_id is null);

-- Notes:
--  * `default 'event'` makes every existing row a normal event — no backfill.
--  * `on delete set null` orphans children when a context is deleted (the events
--    stay on the calendar, just un-grouped) rather than cascading.
--  * No RLS / grant / realtime changes: contexts are ordinary `events` rows for
--    policy purposes and ride the existing events publication + window index.
