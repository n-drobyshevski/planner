-- Planner — task tags.
-- Free-form labels on a task, so tasks can be gathered into streams by tag in
-- the Flows view (and by the MCP `get_flows` tool). A plain text[] column, not
-- the `attributes` jsonb: tags are filtered and grouped on, and a GIN index
-- keeps "tasks with tag X" cheap.
--
-- The normal form (lowercase, no leading '#', no whitespace or commas, 1..40
-- characters, at most 12, no duplicates) is produced by lib/tasks/tags.ts; the
-- CHECK below is the backstop for a writer that skips it. Idempotent, like the
-- client_request_id migration, so a re-run is harmless.

alter table tasks add column if not exists tags text[] not null default '{}';

-- A CHECK can't hold a subquery, so the per-element rules live in an immutable
-- helper. `private` keeps it off the exposed /rpc surface.
create or replace function private.task_tags_valid(tags text[]) returns boolean
  language sql immutable set search_path = '' as $$
  select
    coalesce(array_length(tags, 1), 0) <= 12
    and not exists (
      select 1 from unnest(tags) as t(tag)
      where tag is null
         or char_length(tag) not between 1 and 40
         or tag <> lower(tag)
         or tag ~ '[\s,]'
         or left(tag, 1) = '#'
    )
    and (select count(distinct tag) from unnest(tags) as t(tag))
        = coalesce(array_length(tags, 1), 0);
$$;

-- The CHECK runs as the writing role, so it needs EXECUTE on the helper.
revoke all on function private.task_tags_valid(text[]) from public;
grant execute on function private.task_tags_valid(text[]) to authenticated, service_role;

alter table tasks drop constraint if exists tasks_tags_valid;
alter table tasks add constraint tasks_tags_valid check (private.task_tags_valid(tags));

create index if not exists tasks_tags_idx on tasks using gin (tags);
