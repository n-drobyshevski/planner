-- Planner — task dependencies (blocks / blocked-by).
--
-- A dependency edge: `task_id` is BLOCKED until `depends_on_task_id` is done.
-- This is a second relation, separate from the parent/subtask tree and from the
-- per-parent "do in order" sequential flag — an arbitrary DAG across tasks.
--
-- The DB enforces only that the graph stays ACYCLIC (a cycle would make "blocked"
-- undecidable); whether a blocked task can be completed is a client/UX concern
-- (disabled checkbox + "blocked by N" badge), matching the product's calm stance.
--
-- RLS is scoped THROUGH the tasks (mirrors task_checkpoints): you can READ an
-- edge only when both endpoints are visible to you, and WRITE one only for a
-- blocked task you own (the same ownership tasks_write requires). The nested
-- `tasks` subqueries are themselves RLS-filtered, so visibility/ownership need
-- not be re-derived here.

create table task_dependencies (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references workspaces(id) on delete cascade,
  task_id            uuid not null references tasks(id) on delete cascade, -- blocked
  depends_on_task_id uuid not null references tasks(id) on delete cascade, -- blocker
  created_at         timestamptz not null default now(),
  constraint task_dep_no_self check (task_id <> depends_on_task_id),
  constraint task_dep_unique unique (task_id, depends_on_task_id)
);
create index task_dep_task_idx on task_dependencies(task_id);
create index task_dep_depends_idx on task_dependencies(depends_on_task_id);
create index task_dep_workspace_idx on task_dependencies(workspace_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table task_dependencies enable row level security;

-- READ: workspace-scoped, and both endpoints must be visible (owner or shared).
create policy task_dep_select on task_dependencies for select
  using (
    workspace_id = private.current_workspace_id()
    and exists (select 1 from public.tasks t where t.id = task_id)
    and exists (select 1 from public.tasks d where d.id = depends_on_task_id)
  );

-- WRITE: only the owner of the BLOCKED task manages its dependencies; the
-- blocker need only be visible (so you can depend on a shared task).
create policy task_dep_write on task_dependencies for all
  using (
    workspace_id = private.current_workspace_id()
    and exists (
      select 1 from public.tasks t
      where t.id = task_id and t.owner_id = private.current_member_id()
    )
  )
  with check (
    workspace_id = private.current_workspace_id()
    and exists (
      select 1 from public.tasks t
      where t.id = task_id and t.owner_id = private.current_member_id()
    )
    and exists (select 1 from public.tasks d where d.id = depends_on_task_id)
  );

-- ---------------------------------------------------------------------------
-- Cycle prevention. Before inserting (task_id depends_on depends_on_task_id),
-- reject it if `depends_on_task_id` already (transitively) depends on `task_id`.
-- SECURITY DEFINER so the walk sees the whole graph regardless of the writer's
-- RLS view (a chain can pass through the partner's tasks). INSERT-only: rows are
-- immutable (no UPDATE), and restoreDeleted re-inserts a previously-valid DAG.
-- ---------------------------------------------------------------------------
create or replace function task_dep_check_acyclic() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  found_cycle boolean;
begin
  with recursive reach(id) as (
    select new.depends_on_task_id
    union
    select d.depends_on_task_id
      from public.task_dependencies d
      join reach r on d.task_id = r.id
  )
  select exists (select 1 from reach where id = new.task_id) into found_cycle;
  if found_cycle then
    raise exception 'That dependency would create a cycle';
  end if;
  return new;
end;
$$;
revoke all on function task_dep_check_acyclic() from public, anon, authenticated;

create trigger task_dep_acyclic_guard
  before insert on task_dependencies
  for each row execute function task_dep_check_acyclic();

-- ---------------------------------------------------------------------------
-- Realtime + Data API grants
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table task_dependencies;
grant select, insert, delete on table task_dependencies to authenticated;
