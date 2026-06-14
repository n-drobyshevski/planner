-- Planner — task status-change history.
-- Records every task status transition with a timestamp so the Flows view can
-- draw a task's lifecycle over time (created -> in_progress -> done -> reopened …).
-- The tasks table only carries created_at / updated_at / completed_at, so a
-- "node per status change" can't be reconstructed from it; this append-only log
-- captures transitions going forward and backfills the known anchors (created,
-- completed) for the rows that already exist.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table task_status_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  from_status task_status,                              -- null for the creation event (or backfilled completion: prior unknown)
  to_status   task_status not null,
  changed_by  uuid references members(id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index task_status_events_task_idx on task_status_events(task_id);
create index task_status_events_workspace_idx on task_status_events(workspace_id);

-- ---------------------------------------------------------------------------
-- Recording trigger. AFTER (not BEFORE) so a transition the sequential-subtask
-- guard rejects (it raises in a BEFORE trigger, aborting the statement) is never
-- logged. SECURITY DEFINER so the insert bypasses this table's RLS — clients
-- never write here directly, only this trigger does.
-- The status-change guard lives in the body (not a WHEN clause) because one
-- trigger serves both INSERT and UPDATE, and WHEN can't reference OLD on INSERT.
-- ---------------------------------------------------------------------------
create or replace function tasks_record_status_event() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_status_events
      (task_id, workspace_id, from_status, to_status, changed_by, changed_at)
      values (new.id, new.workspace_id, null, new.status, new.owner_id, new.created_at);
  elsif new.status is distinct from old.status then
    insert into public.task_status_events
      (task_id, workspace_id, from_status, to_status, changed_by, changed_at)
      values (new.id, new.workspace_id, old.status, new.status,
              coalesce(private.current_member_id(), new.owner_id), now());
  end if;
  return null; -- AFTER trigger: the return value is ignored
end;
$$;
-- The trigger runs the function as the table owner regardless of caller grants,
-- so no role needs EXECUTE. Revoke it from everyone (incl. anon/authenticated,
-- which Supabase grants by default) to keep it off the exposed /rpc surface and
-- clear the security advisor.
revoke all on function tasks_record_status_event() from public, anon, authenticated;

create trigger tasks_record_status_event
  after insert or update on tasks
  for each row execute function tasks_record_status_event();

-- ---------------------------------------------------------------------------
-- Backfill the known anchors for existing tasks. We can only honestly assert
-- two moments: when a task was created, and (for done tasks) when it completed.
-- The intermediate todo->in_progress transition was never recorded, so it's
-- omitted rather than fabricated; the completion event leaves from_status null
-- ("prior unknown").
-- ---------------------------------------------------------------------------
insert into task_status_events (task_id, workspace_id, from_status, to_status, changed_by, changed_at)
  select id, workspace_id, null,
         case when status = 'done' then 'todo'::task_status else status end,
         owner_id, created_at
  from tasks;

insert into task_status_events (task_id, workspace_id, from_status, to_status, changed_by, changed_at)
  select id, workspace_id, null, 'done'::task_status, owner_id, completed_at
  from tasks
  where status = 'done' and completed_at is not null;

-- ---------------------------------------------------------------------------
-- Row-Level Security. An event is visible exactly when its task is: the nested
-- tasks query is itself RLS-filtered, so a private task's events stay hidden
-- from the partner. Reuses the existing private.current_workspace_id() helper.
-- No insert/update/delete policy — clients never write; the definer trigger does.
-- ---------------------------------------------------------------------------
alter table task_status_events enable row level security;

create policy task_status_events_select on task_status_events for select
  using (
    workspace_id = private.current_workspace_id()
    and exists (select 1 from public.tasks t where t.id = task_id)
  );

-- ---------------------------------------------------------------------------
-- Realtime + Data API grants (select only; the trigger owns writes)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table task_status_events;

grant select on table task_status_events to authenticated;
