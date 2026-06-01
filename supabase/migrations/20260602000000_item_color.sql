-- Planner — per-item color override for events and tasks.
-- Until now an item's display color was always derived (category color, else a
-- member/scope fallback; see lib/calendar/colors.ts & lib/tasks/colors.ts). This
-- adds an optional own color that wins over the derived one. NULL keeps the
-- existing behaviour, so no backfill is needed.
--
-- Series-level only: the event_overrides table intentionally gets no color
-- column in v1, so recurring events share one color across every occurrence.

alter table events add column color text;
alter table tasks  add column color text;
