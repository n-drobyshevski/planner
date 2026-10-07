-- ---------------------------------------------------------------------------
-- Planner — checkpoint deletes reach clients live.
--
-- 20261009000000_broadcast_deletes_and_editor created the task_checkpoints
-- row_gone trigger only where the table existed, and the live project had
-- not applied 20260626000000_task_checkpoints yet. Now that it has, add the
-- trigger wherever it is still missing (a no-op where it already exists).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.task_checkpoints') is not null
     and not exists (
       select 1 from pg_trigger
       where tgname = 'task_checkpoints_broadcast_delete'
         and tgrelid = 'public.task_checkpoints'::regclass
     ) then
    create trigger task_checkpoints_broadcast_delete
      after delete on public.task_checkpoints
      for each row execute function public.broadcast_row_gone();
  end if;
end;
$$;
