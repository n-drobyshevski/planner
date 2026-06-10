-- Planner — task integrity guards.
-- Moves invariants the client already maintains into the database so a buggy
-- or concurrent client cannot violate them:
--   1. index for "assigned to member" lookups
--   2. priority bounds
--   3. status <-> completed_at coupling (normalized by trigger, then CHECKed)
--   4. sequential subtasks must be completed in order

-- ---------------------------------------------------------------------------
-- 1. Assignee lookups (workspace/parent/owner/board were already indexed)
-- ---------------------------------------------------------------------------
create index tasks_assignee_idx on tasks(assignee_id);

-- ---------------------------------------------------------------------------
-- 2. Priority bounds. The form offers 1..3; 0 stays legal because the schema
--    originally documented 0..3 and legacy rows may carry it.
-- ---------------------------------------------------------------------------
alter table tasks add constraint tasks_priority_range
  check (priority is null or priority between 0 and 3);

-- ---------------------------------------------------------------------------
-- 3. completed_at is set exactly when a task is done. Backfill drifted rows,
--    normalize on every write, and keep a CHECK as documentation + defense.
-- ---------------------------------------------------------------------------
update tasks set completed_at = coalesce(completed_at, updated_at)
  where status = 'done' and completed_at is null;
update tasks set completed_at = null
  where status <> 'done' and completed_at is not null;

create or replace function tasks_normalize_completed_at() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.status = 'done' then
    new.completed_at = coalesce(new.completed_at, now());
  else
    new.completed_at = null;
  end if;
  return new;
end;
$$;

-- Fires before tasks_sequential_guard and tasks_set_updated_at (same-event
-- triggers run in name order), so those always see normalized rows.
create trigger tasks_normalize_completed_at
  before insert or update on tasks
  for each row execute function tasks_normalize_completed_at();

alter table tasks add constraint tasks_completed_at_done
  check ((status = 'done') = (completed_at is not null));

-- ---------------------------------------------------------------------------
-- 4. Sequential subtasks: when a parent is marked `sequential`, a subtask may
--    only flip to done once every earlier sibling is done. "Earlier" mirrors
--    the client sort (position, then created_at, then id — lib/tasks/tree.ts).
--    SECURITY DEFINER so sibling visibility is not truncated by RLS (a shared
--    parent can hold the partner's private subtasks).
--    Deliberately UPDATE-only: undo (restoreDeleted) re-inserts snapshot rows
--    one at a time in arbitrary sibling order; an INSERT guard would break it.
-- ---------------------------------------------------------------------------
create or replace function tasks_check_sequential_done() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  parent_sequential boolean;
begin
  select t.sequential into parent_sequential
    from public.tasks t
    where t.id = new.parent_id;
  if coalesce(parent_sequential, false) and exists (
    select 1 from public.tasks s
    where s.parent_id = new.parent_id
      and s.id <> new.id
      and s.status <> 'done'
      and (s.position, s.created_at, s.id) < (new.position, new.created_at, new.id)
  ) then
    raise exception 'Finish the previous subtask first';
  end if;
  return new;
end;
$$;
revoke all on function tasks_check_sequential_done() from public;

create trigger tasks_sequential_guard
  before update of status on tasks
  for each row
  when (new.status = 'done' and old.status <> 'done' and new.parent_id is not null)
  execute function tasks_check_sequential_done();
