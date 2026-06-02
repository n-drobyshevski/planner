-- Planner — per-member time zone preferences
-- `timezone`: the IANA zone the member's calendar renders in (NULL = follow the
--   device, i.e. Intl.DateTimeFormat().resolvedOptions().timeZone at runtime).
-- `secondary_timezone`: an optional second zone shown alongside the primary in
--   the time-grid (world-clock style); NULL = off.
-- Both are an open set (any IANA name), so no CHECK — the app validates against
-- Intl.supportedValuesOf('timeZone'). Reuses the existing members RLS
-- (members_update_self), so no new policy is needed.
--
-- NOTE: events keep their own `time_zone` column (set at creation, used for
-- DST-correct recurrence expansion). That is distinct from this per-viewer
-- rendering preference and is intentionally left untouched.
--
-- Pre-launch: no data backfill. Any all-day events created before the floating
-- all-day change were stored at the author's local midnight; recreate them if
-- seed data must be exact.

alter table members
  add column timezone text,
  add column secondary_timezone text;
