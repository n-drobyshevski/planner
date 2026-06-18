-- Planner — deeper task nesting (N-level, replacing the old 2-level cap).
-- The client (lib/tasks/nesting.ts canNest) now allows nesting beyond two
-- levels, guarded by cycle prevention + a max-depth bound. This migration moves
-- the integrity-critical half of those guards into the database so a buggy or
-- concurrent client cannot create a cycle or an over-deep chain:
--   * CYCLE: a task may never be nested under one of its own descendants.
--   * MAX-DEPTH: the chain from a task up to its root may be at most MAX_DEPTH
--     edges long (mirror of lib/tasks/tree.ts MAX_DEPTH = 3 → 4 visible levels).
--
-- Unlike tasks_sequential_guard (deliberately UPDATE-only — see 20260612), this
-- guard is safe on INSERT: it walks only *existing ancestors*, each of which is
-- already present (restoreDeleted re-inserts parent-before-child), so it never
-- depends on sibling insertion order. parent_id is already indexed (init).

create or replace function tasks_check_nesting() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  cur uuid := new.parent_id;
  depth int := 0;
  guard int := 0;
  max_depth constant int := 3;   -- mirror lib/tasks/tree.ts MAX_DEPTH
begin
  if new.parent_id is null then
    return new;
  end if;
  -- Walk up the ancestor chain from the proposed parent.
  while cur is not null loop
    if cur = new.id then
      raise exception 'A task cannot be nested under its own descendant';
    end if;
    select t.parent_id into cur from public.tasks t where t.id = cur;
    depth := depth + 1;
    guard := guard + 1;
    if guard > 10000 then
      raise exception 'Task ancestry walk exceeded safe bound';
    end if;
  end loop;
  -- `depth` now counts edges from new to its root (parent = 1 deep, etc.).
  if depth > max_depth then
    raise exception 'Tasks can be nested at most % levels deep', max_depth;
  end if;
  return new;
end;
$$;
revoke all on function tasks_check_nesting() from public, anon, authenticated;

create trigger tasks_nesting_guard
  before insert or update of parent_id on tasks
  for each row execute function tasks_check_nesting();
