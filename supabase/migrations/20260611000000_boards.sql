-- Planner — task boards.
--
-- A board is a named collection of tasks (a Kanban surface). Until now "board"
-- was only a *view* over every task in the workspace; this gives boards a real
-- identity so members can keep separate boards and switch between them.
--
-- Boards mirror `categories`: Personal (`owner_id` = a member, owner-only) or
-- Shared (`owner_id IS NULL`, visible + editable by both). Every task belongs to
-- one board via `tasks.board_id`. Deleting a board that still holds tasks is
-- blocked in the app layer; the FK's ON DELETE SET NULL is only a safety net.
-- Forward-only, data-preserving.

-- ---------------------------------------------------------------------------
-- Table (shape + RLS copied from categories)
-- ---------------------------------------------------------------------------
create table boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_id uuid references members(id) on delete cascade, -- null = shared board
  name text not null,
  color text not null,
  sort_order int not null default 0
);
create index boards_workspace_idx on boards(workspace_id);

alter table boards enable row level security;

-- Shared (owner null) readable/editable by both; personal boards by their owner.
create policy boards_select on boards for select
  using (
    workspace_id = private.current_workspace_id()
    and (owner_id is null or owner_id = private.current_member_id())
  );
create policy boards_write on boards for all
  using (
    workspace_id = private.current_workspace_id()
    and (owner_id is null or owner_id = private.current_member_id())
  )
  with check (
    workspace_id = private.current_workspace_id()
    and (owner_id is null or owner_id = private.current_member_id())
  );

-- ---------------------------------------------------------------------------
-- Scope tasks to a board.
-- ---------------------------------------------------------------------------
alter table tasks add column board_id uuid references boards(id) on delete set null;
create index tasks_board_idx on tasks(board_id);

-- ---------------------------------------------------------------------------
-- Backfill: one Shared default board per workspace; attach every existing task.
-- ---------------------------------------------------------------------------
insert into boards (workspace_id, owner_id, name, color, sort_order)
  select id, null, 'Tasks', '#c0492a', 0 from workspaces;

update tasks t
  set board_id = b.id
  from boards b
  where b.workspace_id = t.workspace_id
    and b.owner_id is null
    and t.board_id is null;

-- ---------------------------------------------------------------------------
-- Realtime + Data API grants
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table boards;

grant select, insert, update, delete on table boards to authenticated;
