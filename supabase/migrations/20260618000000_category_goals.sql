-- Planner — per-category time goals for the Insights views.
-- One goal per category per workspace: `weekly_target_ms` is a WEEKLY budget
-- that app code scales to whatever window is being viewed (a 31-day month
-- compares against target × 31/7); `direction` says what the number means —
-- 'at-least' is a target to reach (e.g. gym time), 'at-most' is a budget cap
-- (e.g. doomscrolling). Goals are workspace-shared, like shared categories:
-- BOTH members see and edit every goal, so the couple plans against one set
-- of numbers. The target range CHECK keeps goals sane (15 minutes .. 7 days
-- per week).

create table category_goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  weekly_target_ms bigint not null,
  direction text not null default 'at-least',
  created_by uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (workspace_id, category_id),
  constraint category_goals_target_range check (weekly_target_ms between 900000 and 604800000),
  constraint category_goals_direction check (direction in ('at-least','at-most'))
);
create index category_goals_workspace_idx on category_goals(workspace_id);

alter table category_goals enable row level security;

-- Workspace-shared (the shared-categories pattern, NOT sleep_logs'): any
-- member of the workspace may read and write any goal.
create policy category_goals_select on category_goals for select
  using (workspace_id = private.current_workspace_id());
create policy category_goals_write on category_goals for all
  using (workspace_id = private.current_workspace_id())
  with check (workspace_id = private.current_workspace_id());

-- Realtime (RLS is enforced for realtime too, so only workspace members
-- receive these rows) + Data API grants, same as tasks/boards.
alter publication supabase_realtime add table category_goals;
grant select, insert, update, delete on table category_goals to authenticated;
