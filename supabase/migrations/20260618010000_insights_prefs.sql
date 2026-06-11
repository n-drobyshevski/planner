-- Planner — per-member Insights customization (saved views + dashboard prefs).
-- Both tables are a personal lens on shared data: how YOU like to slice the
-- couple's time, not a fact about the couple. They are member-private under
-- RLS (the sleep_logs pattern) — the partner never sees your saved views,
-- card order, or suppressed suggestions. They live in the DB rather than
-- localStorage so the lens follows the member across their devices.
--
-- `insights_views` is a named, ordered list of saved filter/period configs;
-- `config` is a jsonb bag validated leniently on read by lib/insights/views.ts
-- so older clients never break newer rows. `insights_prefs` is one row per
-- member: `dashboard` holds card order/hidden ids, `suppressed_kinds` lists
-- suggestion kinds the member has dismissed for good.

create table insights_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  name text not null,
  config jsonb not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  constraint insights_views_name_len check (char_length(name) between 1 and 60)
);
create index insights_views_member_idx on insights_views(member_id);

create table insights_prefs (
  member_id uuid primary key references members(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  dashboard jsonb not null default '{}'::jsonb,
  suppressed_kinds text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table insights_views enable row level security;
alter table insights_prefs enable row level security;

-- Member-private (NOT the events pattern): only the owning member, ever.
create policy insights_views_select on insights_views for select
  using (member_id = private.current_member_id());
create policy insights_views_write on insights_views for all
  using (member_id = private.current_member_id())
  with check (
    workspace_id = private.current_workspace_id()
    and member_id = private.current_member_id()
  );

create policy insights_prefs_select on insights_prefs for select
  using (member_id = private.current_member_id());
create policy insights_prefs_write on insights_prefs for all
  using (member_id = private.current_member_id())
  with check (
    workspace_id = private.current_workspace_id()
    and member_id = private.current_member_id()
  );

-- Realtime (RLS is enforced for realtime too, so the partner's client never
-- receives these rows) + Data API grants, same as tasks/boards.
alter publication supabase_realtime add table insights_views;
alter publication supabase_realtime add table insights_prefs;
grant select, insert, update, delete on table insights_views to authenticated;
grant select, insert, update, delete on table insights_prefs to authenticated;
