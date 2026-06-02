-- Planner — per-member "show inactive events in month view" preference
-- Month cells are cramped, so members can hide the grayed-out inactive events
-- (e.g. sleep hours) there while keeping them in the denser week/day grids.
-- Defaults to true to preserve the existing behavior (inactive events shown,
-- de-emphasized). Reuses the existing members RLS (members_update_self lets a
-- member update only their own row), so no new policy is needed.

alter table members
  add column show_inactive_in_month boolean not null default true;
