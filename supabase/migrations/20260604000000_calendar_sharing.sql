-- Owner-centric sharing model.
--
-- Replaces the 2-D scope/visibility model with a single `is_private` flag:
-- every event/task belongs to one member's calendar (its owner) and is shared
-- (visible to the workspace) by default; a private item is visible only to its
-- owner. Editing is owner-only (no more co-editable "shared" items). The "Shared"
-- calendar concept is gone — sharing is just the default visibility of your own
-- calendar.
--
-- NOTE: this is destructive (drops scope/visibility + their enums). The backfill
-- runs first so existing private items stay private. Apply it together with the
-- application code that reads/writes `is_private`.

-- 1) New flag, backfilled from the old model: personal + private => private.
alter table events add column is_private boolean not null default false;
alter table tasks  add column is_private boolean not null default false;

update events set is_private = (scope = 'personal' and visibility = 'private');
update tasks  set is_private = (scope = 'personal' and visibility = 'private');

-- 2) Rewrite RLS: see your own + anything not private; edit only your own.
drop policy if exists events_select on events;
drop policy if exists events_write on events;
create policy events_select on events for select
  using (
    workspace_id = private.current_workspace_id()
    and (owner_id = private.current_member_id() or not is_private)
  );
create policy events_write on events for all
  using (
    workspace_id = private.current_workspace_id()
    and owner_id = private.current_member_id()
  )
  with check (
    workspace_id = private.current_workspace_id()
    and owner_id = private.current_member_id()
  );

drop policy if exists tasks_select on tasks;
drop policy if exists tasks_write on tasks;
create policy tasks_select on tasks for select
  using (
    workspace_id = private.current_workspace_id()
    and (owner_id = private.current_member_id() or not is_private)
  );
create policy tasks_write on tasks for all
  using (
    workspace_id = private.current_workspace_id()
    and owner_id = private.current_member_id()
  )
  with check (
    workspace_id = private.current_workspace_id()
    and owner_id = private.current_member_id()
  );

-- Overrides inherit the parent event's access.
drop policy if exists overrides_select on event_overrides;
drop policy if exists overrides_write on event_overrides;
create policy overrides_select on event_overrides for select
  using (
    exists (
      select 1 from events e
      where e.id = event_overrides.event_id
        and e.workspace_id = private.current_workspace_id()
        and (e.owner_id = private.current_member_id() or not e.is_private)
    )
  );
create policy overrides_write on event_overrides for all
  using (
    exists (
      select 1 from events e
      where e.id = event_overrides.event_id
        and e.workspace_id = private.current_workspace_id()
        and e.owner_id = private.current_member_id()
    )
  )
  with check (
    exists (
      select 1 from events e
      where e.id = event_overrides.event_id
        and e.workspace_id = private.current_workspace_id()
        and e.owner_id = private.current_member_id()
    )
  );

-- 3) Drop the now-unused columns + enums.
alter table events drop column scope, drop column visibility;
alter table tasks  drop column scope, drop column visibility;
drop type if exists event_scope;
drop type if exists event_visibility;
