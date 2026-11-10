-- ---------------------------------------------------------------------------
-- Planner — dependency deletes reach clients live.
--
-- task_dependencies is in the realtime publication (20260702000000), but a
-- DELETE never matches the clients' `workspace_id=eq.…` filter (the old
-- record carries only the primary key), so removing a "blocked by" edge only
-- showed up on the next refetch. Send it as a `row_gone` broadcast on the
-- workspace's private sync topic, like the other synced tables
-- (20261009000000_broadcast_deletes_and_editor).
--
-- The generic broadcast_row_gone() reads the owner from owner_id/member_id,
-- which this table lacks, so a small sibling derives it from the BLOCKED task
-- (tasks.owner_id via task_id: the owner of the blocked task manages its
-- edges, see task_dep_write). When the edge goes because its task was deleted
-- (ON DELETE CASCADE), that task row is already gone: owner_id is then null
-- and the broadcast is still sent, so clients drop the edge either way. The
-- payload is the same shape the client parses (lib/supabase/realtime.ts
-- parseRowGone): { table, id, kind, owner_id, actor }; an edge has no title.
--
-- Idempotent: create or replace, and the trigger is dropped and recreated.
-- ---------------------------------------------------------------------------

create or replace function broadcast_task_dependency_gone() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  -- Null when the blocked task is gone too (a cascade from its delete).
  select t.owner_id into v_owner from public.tasks t where t.id = old.task_id;

  begin
    perform realtime.send(
      jsonb_build_object(
        'table', tg_table_name,
        'id', old.id,
        'kind', 'delete',
        'owner_id', v_owner,
        'actor', private.current_member_id()
      ),
      'row_gone',
      'workspace:' || old.workspace_id::text || ':sync',
      true
    );
  exception when others then
    -- Best-effort, as broadcast_row_gone: clients reconcile on refetch, and
    -- the user's write must go through regardless.
    raise warning 'row_gone broadcast failed: %', sqlerrm;
  end;

  return null; -- AFTER trigger: the return value is ignored
end;
$$;
revoke all on function broadcast_task_dependency_gone() from public, anon, authenticated;

drop trigger if exists task_dependencies_broadcast_delete on task_dependencies;
create trigger task_dependencies_broadcast_delete
  after delete on task_dependencies
  for each row execute function broadcast_task_dependency_gone();

-- Belt and braces: the table joined the publication in 20260702000000; add it
-- only where it is still missing (adding a table twice fails).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'task_dependencies'
  ) then
    alter publication supabase_realtime add table task_dependencies;
  end if;
end;
$$;
