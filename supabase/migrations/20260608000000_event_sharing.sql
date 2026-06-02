-- Planner — Per-event sharing (joint single events).
--
-- Lets a member mark a SINGLE event Shared (joint) even outside a Shared
-- context, via a NEW stored `events.is_shared` column. Effective jointness is
-- the UNION: a non-private event is joint iff it is `is_shared` OR filed under a
-- Shared context (see private.is_shared_category, added in 20260607000000).
--
-- We only widen the WRITE policies (the non-owner gains write access to such an
-- event); events_select / overrides_select are unchanged — a joint event is
-- non-private, so it is already visible to both members and delivered over
-- realtime. A private event is never joint (the `not is_private` guard), so this
-- never silently exposes anything a member marked Private. Forward-only; the new
-- column defaults false, so every existing row keeps its current behaviour.

-- 1) Stored per-event flag (mirrors is_private: NOT NULL DEFAULT false).
alter table events add column is_shared boolean not null default false;

-- 2) Widen events_write: you own it, OR it is joint — non-private and either
--    explicitly is_shared or filed under a Shared context.
drop policy if exists events_write on events;
create policy events_write on events for all
  using (
    workspace_id = private.current_workspace_id()
    and (
      owner_id = private.current_member_id()
      or (
        not is_private
        and (
          is_shared
          or (category_id is not null and private.is_shared_category(category_id))
        )
      )
    )
  )
  with check (
    workspace_id = private.current_workspace_id()
    and (
      owner_id = private.current_member_id()
      or (
        not is_private
        and (
          is_shared
          or (category_id is not null and private.is_shared_category(category_id))
        )
      )
    )
  );

-- 3) Mirror onto overrides_write: either member may add/edit a per-occurrence
--    override of a joint recurring event (e.-qualified).
drop policy if exists overrides_write on event_overrides;
create policy overrides_write on event_overrides for all
  using (
    exists (
      select 1 from events e
      where e.id = event_overrides.event_id
        and e.workspace_id = private.current_workspace_id()
        and (
          e.owner_id = private.current_member_id()
          or (
            not e.is_private
            and (
              e.is_shared
              or (e.category_id is not null and private.is_shared_category(e.category_id))
            )
          )
        )
    )
  )
  with check (
    exists (
      select 1 from events e
      where e.id = event_overrides.event_id
        and e.workspace_id = private.current_workspace_id()
        and (
          e.owner_id = private.current_member_id()
          or (
            not e.is_private
            and (
              e.is_shared
              or (e.category_id is not null and private.is_shared_category(e.category_id))
            )
          )
        )
    )
  );
