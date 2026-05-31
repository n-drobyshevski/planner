-- Planner — tasks layer.
-- A to-do model layered over the calendar. Tasks reuse the events privacy model
-- (`shared` / `personal`+`private`) so the same RLS guarantees apply. A task can
-- be scheduled onto the calendar as one or more real `events` rows ("parts"),
-- linked back via events.task_id. Subtasks are tasks with a parent_id; a parent
-- may mark its subtasks `sequential` (done in order).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type task_status as enum ('todo', 'in_progress', 'done');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_id     uuid not null references members(id)    on delete cascade, -- creator; drives edit rights
  assignee_id  uuid          references members(id)    on delete set null, -- responsible member (null = unassigned)
  parent_id    uuid          references tasks(id)      on delete cascade,  -- subtask -> parent; null = top-level
  category_id  uuid          references categories(id) on delete set null,
  title text not null,
  description text,
  scope event_scope not null,                          -- reuse events' enum
  visibility event_visibility not null,                 -- shared scope => 'shared'
  status task_status not null default 'todo',
  priority smallint,                                    -- 0..3, null = none
  due_at timestamptz,                                   -- optional deadline (UTC)
  position double precision not null default 0,         -- order within status column / among siblings
  sequential boolean not null default false,            -- parent only: subtasks done in order
  completed_at timestamptz,                             -- set when status -> done
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_no_self_parent check (parent_id is null or parent_id <> id)
);
create index tasks_workspace_idx on tasks(workspace_id);
create index tasks_parent_idx on tasks(parent_id);
create index tasks_owner_idx on tasks(owner_id);

-- A scheduled block: an event that belongs to a task ("part" of it). Most
-- events have task_id = null (ordinary calendar events). Deleting a task
-- removes its scheduled blocks.
alter table events add column task_id uuid references tasks(id) on delete cascade;
create index events_task_idx on events(task_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger (reuses the shared set_updated_at() from the init migration)
-- ---------------------------------------------------------------------------
create trigger tasks_set_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security — identical shape to events. Reuses the existing
-- private.current_workspace_id() / private.current_member_id() helpers, so no
-- new function grants are needed.
-- ---------------------------------------------------------------------------
alter table tasks enable row level security;

create policy tasks_select on tasks for select
  using (
    workspace_id = private.current_workspace_id()
    and (
      scope = 'shared'
      or owner_id = private.current_member_id()
      or (scope = 'personal' and visibility = 'shared')
    )
  );
create policy tasks_write on tasks for all
  using (
    workspace_id = private.current_workspace_id()
    and (owner_id = private.current_member_id() or scope = 'shared')
  )
  with check (
    workspace_id = private.current_workspace_id()
    and (owner_id = private.current_member_id() or scope = 'shared')
  );

-- ---------------------------------------------------------------------------
-- Realtime + Data API grants
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table tasks;

grant select, insert, update, delete on table tasks to authenticated;
