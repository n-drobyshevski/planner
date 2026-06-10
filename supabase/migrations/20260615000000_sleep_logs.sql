-- Planner — per-member sleep logs (morning check-ins + backfilled nights).
-- One row per member per WAKE date: `date` is the zone-free yyyy-mm-dd token of
-- the morning the member woke up (keyed via the viewer's zone at write time);
-- bedtime_at/woke_at are optional real instants; quality is 1..5; fatigue is a
-- simplified 1..9 Karolinska Sleepiness Scale. Sleep is personal, so RLS is
-- member-private: rows are visible and writable ONLY by the owning member —
-- the partner never sees them (stricter than events' scope/visibility model).

create table sleep_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  date date not null,              -- WAKE date (zone-free calendar token)
  bedtime_at timestamptz,          -- when they got into bed (optional)
  woke_at timestamptz,             -- when they got up (optional)
  quality smallint,                -- 1 (poor) .. 5 (great)
  fatigue smallint,                -- KSS-style 1 (alert) .. 9 (fighting sleep)
  note text,
  created_at timestamptz not null default now(),
  unique (member_id, date),        -- one night per member; upsert key
  constraint sleep_logs_quality_range check (quality is null or quality between 1 and 5),
  constraint sleep_logs_fatigue_range check (fatigue is null or fatigue between 1 and 9),
  constraint sleep_logs_time_order
    check (bedtime_at is null or woke_at is null or woke_at > bedtime_at)
);

alter table sleep_logs enable row level security;

-- Member-private (NOT the events pattern): only the owning member, ever.
create policy sleep_logs_select on sleep_logs for select
  using (member_id = private.current_member_id());
create policy sleep_logs_write on sleep_logs for all
  using (member_id = private.current_member_id())
  with check (
    workspace_id = private.current_workspace_id()
    and member_id = private.current_member_id()
  );

-- Realtime (RLS is enforced for realtime too, so the partner's client never
-- receives these rows) + Data API grants, same as tasks/boards.
alter publication supabase_realtime add table sleep_logs;
grant select, insert, update, delete on table sleep_logs to authenticated;
