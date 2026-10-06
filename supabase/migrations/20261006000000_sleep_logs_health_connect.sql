-- Planner — sleep from Health Connect.
--
-- The Android app reads the member's sleep sessions from Health Connect
-- (Pixel Watch, Fitbit, Samsung, …) and writes each night into the same
-- `sleep_logs` row a manual check-in uses (one per member + wake date).
-- A row can therefore mix both: device times and stages, the member's own
-- quality / fatigue / note.
--
-- `times_source` says where bedtime_at / woke_at came from. The device
-- wins on times: its upsert sends only the columns below, and a PostgREST
-- upsert updates only the columns it sends, so the ratings and note are
-- never touched. The web check-in sends times (and 'manual') only when the
-- member actually edited them.
--
-- Stage minutes are null when the source didn't report stages; asleep_min
-- is null when there were no stages at all (in bed ≠ asleep).

alter table sleep_logs
  add column times_source text not null default 'manual',
  add column external_id text,
  add column asleep_min smallint,
  add column deep_min smallint,
  add column light_min smallint,
  add column rem_min smallint,
  add column awake_min smallint,
  add column updated_at timestamptz not null default now(),
  add constraint sleep_logs_times_source check (times_source in ('manual', 'health_connect')),
  add constraint sleep_logs_external_id_len check (external_id is null or char_length(external_id) <= 200),
  add constraint sleep_logs_stage_ranges check (
    coalesce(asleep_min, 0) between 0 and 1440
    and coalesce(deep_min, 0) between 0 and 1440
    and coalesce(light_min, 0) between 0 and 1440
    and coalesce(rem_min, 0) between 0 and 1440
    and coalesce(awake_min, 0) between 0 and 1440
  );

-- Reuses the shared set_updated_at() from the init migration.
create trigger sleep_logs_set_updated_at
  before update on sleep_logs
  for each row execute function set_updated_at();
