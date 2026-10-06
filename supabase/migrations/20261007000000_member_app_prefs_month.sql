-- Planner — the Android agenda's Month view follows the member too.
--
-- `agenda_mode` only took 'day' / 'week', so the phone kept Month on the
-- device alone. Widen the check so the account copy can carry it.

alter table member_app_prefs
  drop constraint member_app_prefs_agenda_mode,
  add constraint member_app_prefs_agenda_mode check (agenda_mode in ('day', 'week', 'month'));
