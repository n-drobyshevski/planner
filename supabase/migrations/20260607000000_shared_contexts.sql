-- Planner — Shared Contexts (joint events).
--
-- A context (a `categories` row) is Personal (`owner_id` = a member) or Shared
-- (`owner_id IS NULL`, visible + editable by both — pre-existing). Events filed
-- under a Shared context become JOINT: both members may insert / edit / delete
-- them, in addition to events they own. Jointness is DERIVED from the category
-- (no `events.is_shared` column), so moving an event in/out of a Shared context
-- flips its jointness with no extra bookkeeping.
--
-- A JOINT event is a NON-PRIVATE event under a Shared context. `events_select`
-- already returns non-private events to both members (and realtime delivers
-- them), so we only widen the WRITE policies — the non-owner gains write access
-- to a joint event. A private event under a Shared context stays strictly
-- owner-only (the `and not is_private` guard), so this migration does NOT touch
-- any existing row: nothing a member marked Private is ever silently exposed.
-- Forward-only, data-preserving.

-- 1) Predicate helper (private schema, like current_member_id). SECURITY DEFINER
--    bypasses RLS on categories and avoids policy recursion. MUST be granted to
--    `authenticated` or RLS silently denies (every policy below calls it).
create or replace function private.is_shared_category(cat uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.categories c
    where c.id = cat and c.owner_id is null
  )
$$;
revoke all on function private.is_shared_category(uuid) from public;
grant execute on function private.is_shared_category(uuid) to authenticated;

-- 2) Widen events_write: you own it, OR it is a JOINT event — non-private and
--    filed under a Shared context. (events_select is unchanged — a joint event
--    is non-private, so it is already visible to both.)
drop policy if exists events_write on events;
create policy events_write on events for all
  using (
    workspace_id = private.current_workspace_id()
    and (
      owner_id = private.current_member_id()
      or (
        not is_private
        and category_id is not null
        and private.is_shared_category(category_id)
      )
    )
  )
  with check (
    workspace_id = private.current_workspace_id()
    and (
      owner_id = private.current_member_id()
      or (
        not is_private
        and category_id is not null
        and private.is_shared_category(category_id)
      )
    )
  );

-- 3) Mirror it onto overrides_write: either member may add/edit a per-occurrence
--    override of a joint recurring event. (overrides_select is unchanged.)
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
            and e.category_id is not null
            and private.is_shared_category(e.category_id)
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
            and e.category_id is not null
            and private.is_shared_category(e.category_id)
          )
        )
    )
  );

-- 4) Index the joint predicate's scan path (events grouped by category).
create index if not exists events_category_idx on events(category_id);
