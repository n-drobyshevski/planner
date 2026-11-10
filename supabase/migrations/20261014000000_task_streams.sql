-- Planner — saved streams (named Flows display configurations).
-- A stream is a member's saved way of looking at the couple's tasks in the
-- Flows view: a filter, a grouping and a sort, under a name the member can
-- reopen from the web app and the MCP server can look up ("show me my
-- Errands stream"). Like `insights_views` it is a personal lens on shared
-- data, so it is member-private under RLS: the partner never sees your
-- streams. It lives in the DB rather than localStorage so it follows the
-- member across devices and is reachable server-side.
--
-- `definition` is a jsonb bag read leniently by coerceFlowsDisplay()
-- (lib/tasks/flows-display.ts), so a row written by a newer client never
-- breaks an older one and vice versa. The name is unique per member, ignoring
-- case, so a lookup by name is unambiguous; the app trims it (1..60 chars,
-- lib/tasks/schemas.ts) and the CHECK below is the backstop.
--
-- Idempotent throughout (if not exists / drop ... if exists / guarded DO
-- blocks), like the task_tags and client_request_id migrations, so a re-run
-- is harmless.

create table if not exists task_streams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  name text not null,
  definition jsonb not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_streams_name_len check (char_length(name) between 1 and 60)
);

-- One name per member, case-insensitively ("Errands" and "errands" clash).
-- Leads with member_id, so it also serves the per-member list query.
create unique index if not exists task_streams_member_name_key
  on task_streams (member_id, lower(name));
-- Covers the workspace_id foreign key (workspace deletes cascade through it).
create index if not exists task_streams_workspace_idx on task_streams (workspace_id);

-- Reuses the shared set_updated_at() (init, made monotonic by
-- 20261008000000_monotonic_updated_at).
drop trigger if exists task_streams_set_updated_at on task_streams;
create trigger task_streams_set_updated_at
  before update on task_streams
  for each row execute function set_updated_at();

alter table task_streams enable row level security;

-- Member-private (the insights_views pattern): only the owning member, ever.
drop policy if exists task_streams_select on task_streams;
create policy task_streams_select on task_streams for select
  using (member_id = private.current_member_id());
drop policy if exists task_streams_write on task_streams;
create policy task_streams_write on task_streams for all
  using (member_id = private.current_member_id())
  with check (
    workspace_id = private.current_workspace_id()
    and member_id = private.current_member_id()
  );

-- Deletes can't reach a filtered Postgres Changes subscription (the old
-- record carries only the id), so send them as row_gone broadcasts on the
-- workspace's private sync topic, as sleep_logs does
-- (20261009000000_broadcast_deletes_and_editor). The payload is the id and
-- owner only, never the name or definition.
drop trigger if exists task_streams_broadcast_delete on task_streams;
create trigger task_streams_broadcast_delete
  after delete on task_streams
  for each row execute function broadcast_row_gone();

-- Realtime (RLS is enforced for realtime too, so the partner's client never
-- receives these rows). Guarded: adding a table twice fails the migration.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'task_streams'
  ) then
    alter publication supabase_realtime add table task_streams;
  end if;
end;
$$;

-- Data API grants, same as insights_views (grant is a no-op when repeated).
grant select, insert, update, delete on table task_streams to authenticated;
