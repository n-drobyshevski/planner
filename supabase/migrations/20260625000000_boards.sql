-- Planner — boards as editable task columns (task status → board).
--
-- Until now a task's lifecycle column was the fixed `task_status` enum
-- (todo/in_progress/done), rendered as the same three kanban columns for every
-- collection, and the Flows line style was a single property of the collection.
--
-- This makes columns first-class and user-editable: a *board* is one
-- state/column, a collection HAS MANY boards (its ordered columns), and a task's
-- status becomes *which board it sits in* (`tasks.board_id`). Each board owns its
-- name, Flows `line_style`, order, and an `is_done` flag (the completion column).
-- "Done" is driven by the board's `is_done`: the completed_at coupling and the
-- sequential-subtask guard key off it. The `task_status_events` history (which the
-- Flows view is built on) is migrated to reference boards, keeping a denormalized
-- `to_is_done` so Flows can classify a Done node without a board lookup.
--
-- Forward-only, data-preserving. Drop order matters: the `task_status` enum is
-- removed only after every column/function/trigger that referenced it is gone.

-- ---------------------------------------------------------------------------
-- 1. boards table. A board belongs to a collection; visibility/editability is
--    inherited from that collection (shared collections are visible to both,
--    personal collections to their owner). RLS is scoped THROUGH the collection
--    since a board carries no owner of its own.
-- ---------------------------------------------------------------------------
create table boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  collection_id uuid not null references collections(id) on delete cascade,
  name text not null,
  line_style text not null default 'solid',
  position double precision not null default 0,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index boards_collection_idx on boards(collection_id);
create index boards_workspace_idx on boards(workspace_id);

create trigger boards_set_updated_at
  before update on boards
  for each row execute function set_updated_at();

alter table boards enable row level security;

create policy boards_select on boards for select
  using (
    workspace_id = private.current_workspace_id()
    and exists (
      select 1 from collections c
      where c.id = collection_id
        and (c.owner_id is null or c.owner_id = private.current_member_id())
    )
  );
create policy boards_write on boards for all
  using (
    workspace_id = private.current_workspace_id()
    and exists (
      select 1 from collections c
      where c.id = collection_id
        and (c.owner_id is null or c.owner_id = private.current_member_id())
    )
  )
  with check (
    workspace_id = private.current_workspace_id()
    and exists (
      select 1 from collections c
      where c.id = collection_id
        and (c.owner_id is null or c.owner_id = private.current_member_id())
    )
  );

alter publication supabase_realtime add table boards;
grant select, insert, update, delete on table boards to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Seed three default boards per existing collection, inheriting the
--    collection's current Flows line style. The right-most ("Done") board is the
--    completion column.
-- ---------------------------------------------------------------------------
insert into boards (workspace_id, collection_id, name, line_style, position, is_done)
  select c.workspace_id, c.id, x.name, c.line_style, x.pos, x.is_done
  from collections c
  cross join (values
    ('To Do', 0, false),
    ('In Progress', 1, false),
    ('Done', 2, true)
  ) as x(name, pos, is_done);

-- ---------------------------------------------------------------------------
-- 3. Scope tasks to a board, backfilled from the old status THROUGH the task's
--    collection (todo→pos 0, in_progress→pos 1, done→pos 2 / is_done). Tasks with
--    no collection have no boards and keep board_id null (they never render in a
--    collection's board). Post-migration check: the count of
--    (board_id is null and collection_id is not null) must be 0.
-- ---------------------------------------------------------------------------
alter table tasks add column board_id uuid references boards(id) on delete set null;
create index tasks_board_idx on tasks(board_id);

update tasks t
  set board_id = b.id
  from boards b
  where b.collection_id = t.collection_id
    and t.collection_id is not null
    and b.position = case t.status
      when 'todo' then 0
      when 'in_progress' then 1
      when 'done' then 2
    end;

-- ---------------------------------------------------------------------------
-- 4. Migrate the status-event history to reference boards. `to_is_done` is
--    denormalized so the pure Flows layout can classify a Done node without a
--    board lookup (boards can be renamed/reordered later; is_done is the stable
--    semantic). Board ids may be null for events of null-collection tasks; the
--    is_done flag still classifies them.
-- ---------------------------------------------------------------------------
alter table task_status_events
  add column from_board_id uuid references boards(id) on delete set null,
  add column to_board_id   uuid references boards(id) on delete set null,
  add column to_is_done    boolean;

update task_status_events e
  set to_board_id = sub.bid, to_is_done = sub.is_done
  from (
    select e2.id,
           b.id as bid,
           coalesce(b.is_done, e2.to_status = 'done') as is_done
    from task_status_events e2
    join tasks t on t.id = e2.task_id
    left join boards b
      on b.collection_id = t.collection_id
     and b.position = case e2.to_status
       when 'todo' then 0
       when 'in_progress' then 1
       when 'done' then 2
     end
  ) sub
  where sub.id = e.id;

update task_status_events e
  set from_board_id = sub.bid
  from (
    select e2.id, b.id as bid
    from task_status_events e2
    join tasks t on t.id = e2.task_id
    left join boards b
      on b.collection_id = t.collection_id
     and b.position = case e2.from_status
       when 'todo' then 0
       when 'in_progress' then 1
       when 'done' then 2
     end
    where e2.from_status is not null
  ) sub
  where sub.id = e.id;

alter table task_status_events alter column to_is_done set not null;

-- ---------------------------------------------------------------------------
-- 5. Recording trigger now keys off board_id. SECURITY DEFINER (as before) so the
--    insert bypasses this table's RLS; it also reads boards.is_done for the
--    denormalized flag.
-- ---------------------------------------------------------------------------
create or replace function tasks_record_status_event() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  v_done boolean;
begin
  if tg_op = 'INSERT' then
    select b.is_done into v_done from public.boards b where b.id = new.board_id;
    insert into public.task_status_events
      (task_id, workspace_id, from_board_id, to_board_id, to_is_done, changed_by, changed_at)
      values (new.id, new.workspace_id, null, new.board_id, coalesce(v_done, false),
              new.owner_id, new.created_at);
  elsif new.board_id is distinct from old.board_id then
    select b.is_done into v_done from public.boards b where b.id = new.board_id;
    insert into public.task_status_events
      (task_id, workspace_id, from_board_id, to_board_id, to_is_done, changed_by, changed_at)
      values (new.id, new.workspace_id, old.board_id, new.board_id, coalesce(v_done, false),
              coalesce(private.current_member_id(), new.owner_id), now());
  end if;
  return null; -- AFTER trigger: the return value is ignored
end;
$$;
revoke all on function tasks_record_status_event() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. completed_at coupling + sequential guard now driven by the board's is_done.
--    The old declarative CHECK (status = 'done') = (completed_at is not null)
--    cannot be re-expressed as a same-table CHECK (it needs boards.is_done), so
--    the coupling becomes trigger-only — the BEFORE normalize trigger stays
--    authoritative. SECURITY DEFINER so the trigger can read boards regardless of
--    the writer's RLS view.
-- ---------------------------------------------------------------------------
alter table tasks drop constraint tasks_completed_at_done;

create or replace function tasks_normalize_completed_at() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  v_done boolean;
begin
  select b.is_done into v_done from public.boards b where b.id = new.board_id;
  if coalesce(v_done, false) then
    new.completed_at = coalesce(new.completed_at, now());
  else
    new.completed_at = null;
  end if;
  return new;
end;
$$;
revoke all on function tasks_normalize_completed_at() from public, anon, authenticated;

-- Re-key the sequential-subtask guard to board moves. WHEN can't query boards, so
-- the "moving into a done-board" test lives in the body. "Not done" siblings are
-- those whose board is not a done-board (or has no board).
drop trigger tasks_sequential_guard on tasks;

create or replace function tasks_check_sequential_done() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  parent_sequential boolean;
  v_done boolean;
begin
  select b.is_done into v_done from public.boards b where b.id = new.board_id;
  if not coalesce(v_done, false) then
    return new; -- not moving into a completion column; nothing to guard
  end if;
  select t.sequential into parent_sequential
    from public.tasks t
    where t.id = new.parent_id;
  if coalesce(parent_sequential, false) and exists (
    select 1 from public.tasks s
    left join public.boards sb on sb.id = s.board_id
    where s.parent_id = new.parent_id
      and s.id <> new.id
      and coalesce(sb.is_done, false) = false
      and (s.position, s.created_at, s.id) < (new.position, new.created_at, new.id)
  ) then
    raise exception 'Finish the previous subtask first';
  end if;
  return new;
end;
$$;
revoke all on function tasks_check_sequential_done() from public;

create trigger tasks_sequential_guard
  before update of board_id on tasks
  for each row
  when (new.board_id is distinct from old.board_id and new.parent_id is not null)
  execute function tasks_check_sequential_done();

-- ---------------------------------------------------------------------------
-- 7. Drop the legacy enum columns/type now that nothing references them.
-- ---------------------------------------------------------------------------
alter table task_status_events drop column from_status, drop column to_status;
alter table collections drop column line_style;
alter table tasks drop column status;
drop type task_status;
