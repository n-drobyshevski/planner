-- Phase 4 (public sharing) — per-event opt-out from public share links.
--
-- A non-private event is normally eligible to appear on a public share link; this
-- flag withholds an individual event (and its occurrences) from EVERY public link
-- and from present mode, independent of `is_private`. Default false = unchanged
-- behavior. The strict public-read filter (public_calendar_events, added next
-- migration) and the TS `publicVisible` mirror each other on this column.

alter table events
  add column hidden_from_public boolean not null default false;
