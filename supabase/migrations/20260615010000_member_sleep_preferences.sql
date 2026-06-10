-- Planner — per-member sleep planning preferences.
-- Cycle length (one full sleep cycle, minutes), onset latency (time to fall
-- asleep after getting into bed), and the nightly cycle target drive the
-- bedtime calculator and the "Tonight" recommendation on the Insights Sleep
-- tab. Defaults match the common 90-minute / 15-minute / 5-cycle guidance.
-- Reuses members_update_self RLS (a member updates only their own row).

alter table members
  add column sleep_cycle_length_min smallint not null default 90
    constraint members_sleep_cycle_length_range
    check (sleep_cycle_length_min between 70 and 110),
  add column sleep_onset_latency_min smallint not null default 15
    constraint members_sleep_onset_latency_range
    check (sleep_onset_latency_min between 0 and 60),
  add column target_sleep_cycles smallint not null default 5
    constraint members_target_sleep_cycles_range
    check (target_sleep_cycles between 3 and 7);
