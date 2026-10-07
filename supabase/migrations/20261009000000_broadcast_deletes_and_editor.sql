-- ---------------------------------------------------------------------------
-- Planner — deletes over a private broadcast topic, and who last edited a row.
--
-- Postgres Changes can't carry deletes to a filtered subscription: the old
-- record holds only the primary key, so `workspace_id=eq.…` never matches a
-- DELETE. The clients worked around it with an UNFILTERED delete binding,
-- which RLS doesn't cover either, so every client heard every workspace's
-- deletes (bare ids, but still other households' activity). And when an
-- item turns private, RLS simply stops delivering it to the partner: there
-- is no event at all, so the stale row lingered until the next refetch.
--
-- Both now go through Realtime Broadcast from the database instead:
--
--   * AFTER DELETE triggers on the synced tables, and AFTER UPDATE OF
--     is_private on events/tasks (shared -> private only), send a `row_gone`
--     message to the PRIVATE topic `workspace:<workspace_id>:sync`.
--   * A SELECT policy on realtime.messages lets a signed-in member join only
--     their own workspace's topic. There is no INSERT policy, so no client
--     can broadcast into it: every message comes from these triggers.
--
-- The payload is { table, id, kind ('delete' | 'hidden'), owner_id, actor },
-- plus, for an events/tasks DELETE of a row that was not private, its
-- `title` (and `starts_at` / `ends_at` for events) so the partner-change
-- notifier can say what went. A private row never carries its title. Its
-- id and owner do reach the partner (the topic is per workspace; Realtime
-- checks the policy at join time, not per message), which reveals no
-- content. `owner_id` is the row's owner (`member_id` for sleep_logs; null
-- for shared rows and for tables with no owner). A client drops the row on
-- 'delete', and on 'hidden' unless it owns the row. A failed send never
-- fails the user's write.
--
-- `updated_by` records the member whose write last touched an event/task,
-- for the same notifier. It is stamped server-side from the caller's session
-- (clients never send it); service-role and cron writes have no member and
-- keep the previous value.
--
-- Last, timeslot_requests joins the realtime publication (its RLS is already
-- owner-only), so the owner's Inbox can follow it live (no client subscribes
-- to it yet).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. updated_by on events and tasks.
--    SECURITY DEFINER because service-role writes (seed, admin paths) have no
--    USAGE on the `private` schema; auth.uid() still reads the caller's JWT.
--    It only sets updated_by, so it composes with set_updated_at() (BEFORE
--    UPDATE) and the BEFORE triggers on tasks in either firing order, and no
--    RLS check or constraint looks at the column.
-- ---------------------------------------------------------------------------
alter table events add column updated_by uuid references members(id) on delete set null;
alter table tasks  add column updated_by uuid references members(id) on delete set null;

create or replace function set_updated_by() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  new.updated_by := coalesce(private.current_member_id(), new.updated_by);
  return new;
end;
$$;
revoke all on function set_updated_by() from public, anon, authenticated;

create trigger events_set_updated_by
  before insert or update on events
  for each row execute function set_updated_by();

create trigger tasks_set_updated_by
  before insert or update on tasks
  for each row execute function set_updated_by();

-- ---------------------------------------------------------------------------
-- 2. row_gone broadcasts. One function for every table: the row is read
--    through to_jsonb(old), so a column a table lacks is simply null. Every
--    table below carries workspace_id (event_overrides, boards and
--    task_checkpoints denormalize it), so the topic needs no lookup.
--    SECURITY DEFINER so realtime.send can write realtime.messages.
-- ---------------------------------------------------------------------------
create or replace function broadcast_row_gone() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := to_jsonb(old);
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'table', tg_table_name,
    'id', old.id,
    'kind', case when tg_op = 'DELETE' then 'delete' else 'hidden' end,
    'owner_id', coalesce(v_old -> 'owner_id', v_old -> 'member_id'),
    'actor', private.current_member_id()
  );

  -- What went, for the notifier: never for a row that was private.
  if tg_op = 'DELETE'
     and tg_table_name in ('events', 'tasks')
     and not coalesce((v_old ->> 'is_private')::boolean, false) then
    v_payload := v_payload || jsonb_build_object('title', v_old -> 'title');
    if tg_table_name = 'events' then
      v_payload := v_payload || jsonb_build_object(
        'starts_at', v_old -> 'starts_at',
        'ends_at', v_old -> 'ends_at'
      );
    end if;
  end if;

  begin
    perform realtime.send(
      v_payload,
      'row_gone',
      'workspace:' || (v_old ->> 'workspace_id') || ':sync',
      true
    );
  exception when others then
    -- Live delivery is best-effort: the clients reconcile on their next
    -- refetch, so the user's write must go through regardless.
    raise warning 'row_gone broadcast failed: %', sqlerrm;
  end;

  return null; -- AFTER trigger: the return value is ignored
end;
$$;
revoke all on function broadcast_row_gone() from public, anon, authenticated;

create trigger events_broadcast_delete
  after delete on events
  for each row execute function broadcast_row_gone();
create trigger event_overrides_broadcast_delete
  after delete on event_overrides
  for each row execute function broadcast_row_gone();
create trigger tasks_broadcast_delete
  after delete on tasks
  for each row execute function broadcast_row_gone();
create trigger categories_broadcast_delete
  after delete on categories
  for each row execute function broadcast_row_gone();
create trigger collections_broadcast_delete
  after delete on collections
  for each row execute function broadcast_row_gone();
create trigger boards_broadcast_delete
  after delete on boards
  for each row execute function broadcast_row_gone();
-- task_checkpoints may not exist yet on every database (its migration can be
-- pending), so its trigger is created only where the table is there.
do $$
begin
  if to_regclass('public.task_checkpoints') is not null then
    create trigger task_checkpoints_broadcast_delete
      after delete on public.task_checkpoints
      for each row execute function public.broadcast_row_gone();
  end if;
end;
$$;
create trigger sleep_logs_broadcast_delete
  after delete on sleep_logs
  for each row execute function broadcast_row_gone();

-- Shared -> private: RLS stops delivering the row to the partner, so tell
-- them to drop it. (Private -> shared arrives as an ordinary UPDATE.)
create trigger events_broadcast_hidden
  after update of is_private on events
  for each row
  when (old.is_private = false and new.is_private = true)
  execute function broadcast_row_gone();
create trigger tasks_broadcast_hidden
  after update of is_private on tasks
  for each row
  when (old.is_private = false and new.is_private = true)
  execute function broadcast_row_gone();

-- ---------------------------------------------------------------------------
-- 3. Who may join the topic: a signed-in member, for their own workspace
--    only. realtime.topic() is the topic being joined; the helper is the same
--    one every table policy uses (executable by authenticated). No INSERT
--    policy: clients can listen but never send.
-- ---------------------------------------------------------------------------
create policy workspace_sync_read on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic())
      = 'workspace:' || (select private.current_workspace_id())::text || ':sync'
  );

-- ---------------------------------------------------------------------------
-- 4. Live Inbox: timeslot requests over Postgres Changes (owner-only RLS).
--    Guarded: a table switched on for Realtime from the dashboard is already
--    in the publication, and adding it twice would fail the whole migration.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'timeslot_requests'
  ) then
    alter publication supabase_realtime add table timeslot_requests;
  end if;
end;
$$;
