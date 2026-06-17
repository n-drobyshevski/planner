-- Planner — move per-member sleep PREFERENCES off the members table into a
-- member-private table.
--
-- Sleep prefs (cycle/onset/target for the bedtime calculator + the dedicated
-- sleep category and night window for derived nights) were columns on `members`,
-- whose members_select RLS is workspace-wide — so the partner could read another
-- member's sleep prefs via the Data API. Sleep is personal: like sleep_logs, the
-- prefs belong only to the owning member. This table is member-private (rows
-- visible/writable ONLY by the owning member); the app only ever reads/writes the
-- viewer's own row.

create table member_sleep_prefs (
  member_id uuid primary key references members(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- Bedtime calculator + "Tonight" recommendation (common 90/15/5 guidance).
  sleep_cycle_length_min smallint not null default 90
    constraint member_sleep_prefs_cycle_length_range
    check (sleep_cycle_length_min between 70 and 110),
  sleep_onset_latency_min smallint not null default 15
    constraint member_sleep_prefs_onset_latency_range
    check (sleep_onset_latency_min between 0 and 60),
  target_sleep_cycles smallint not null default 5
    constraint member_sleep_prefs_target_cycles_range
    check (target_sleep_cycles between 3 and 7),
  -- Derived-night controls: optional dedicated sleep category (NULL keeps the
  -- inactive≡sleep heuristic) and the per-member night window (defaults 20→12).
  sleep_category_id uuid references categories(id) on delete set null,
  night_window_start_hour smallint not null default 20
    constraint member_sleep_prefs_night_window_start_range
    check (night_window_start_hour between 12 and 23),
  night_window_end_hour smallint not null default 12
    constraint member_sleep_prefs_night_window_end_range
    check (night_window_end_hour between 4 and 16),
  created_at timestamptz not null default now()
);

alter table member_sleep_prefs enable row level security;

-- Member-private (mirrors sleep_logs): only the owning member, ever.
create policy member_sleep_prefs_select on member_sleep_prefs for select
  using (member_id = private.current_member_id());
create policy member_sleep_prefs_write on member_sleep_prefs for all
  using (member_id = private.current_member_id())
  with check (
    workspace_id = private.current_workspace_id()
    and member_id = private.current_member_id()
  );

grant select, insert, update, delete on table member_sleep_prefs to authenticated;

-- Carry over every member's existing prefs, then retire the columns on members.
insert into member_sleep_prefs (
  member_id, workspace_id,
  sleep_cycle_length_min, sleep_onset_latency_min, target_sleep_cycles,
  sleep_category_id, night_window_start_hour, night_window_end_hour
)
select
  id, workspace_id,
  sleep_cycle_length_min, sleep_onset_latency_min, target_sleep_cycles,
  sleep_category_id, night_window_start_hour, night_window_end_hour
from members;

alter table members
  drop column sleep_cycle_length_min,
  drop column sleep_onset_latency_min,
  drop column target_sleep_cycles,
  drop column sleep_category_id,
  drop column night_window_start_hour,
  drop column night_window_end_hour;
