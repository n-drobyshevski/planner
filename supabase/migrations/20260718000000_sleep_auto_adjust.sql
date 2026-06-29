-- Auto-adjust the calendar sleep block from a sleep check-in.
--
-- When a member logs a check-in carrying both a bedtime and a wake time, the
-- Sleep tab snaps that night's calendar sleep block to those times (creating one
-- if none exists). This per-member flag gates that behaviour. Defaults true so
-- logging times reflects on the shared calendar out of the box; flip it off in
-- Settings → Sleep to keep check-ins from touching the calendar.
--
-- Member-private like the rest of member_sleep_prefs (RLS already scopes the row
-- to its owner), so no policy change is needed.

ALTER TABLE member_sleep_prefs
  ADD COLUMN auto_adjust_sleep_on_feedback boolean NOT NULL DEFAULT true;
