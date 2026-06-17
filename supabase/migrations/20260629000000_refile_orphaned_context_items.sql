-- Re-file items orphaned when a shared context/collection is made personal.
--
-- Visibility asymmetry: a member may READ an event/task that is not private
-- (events_select / tasks_select), but may only READ a category/collection that
-- is shared (owner_id null) or their own (categories_select / collections_select).
-- So a member can own/see an item filed under a context that was SHARED at the
-- time, then converted to the OTHER member's PERSONAL one (setCategoryOwner /
-- setCollectionOwner). The conversion never rewrote the items, leaving the
-- partner's items pointing at a context they can no longer read — Insights then
-- rendered it as "Unknown".
--
-- The converting member's own client cannot fix this: once the context is
-- personal, RLS forbids them from writing the partner's now-non-joint rows
-- (events_write / tasks_write WITH CHECK fails). So we re-file in a SECURITY
-- DEFINER trigger that runs at the moment of conversion, plus a one-time
-- backfill for rows already orphaned by past conversions / pre-sharing-model
-- legacy data. "Re-filed" = category_id / collection_id set to NULL ("No
-- context" / "No collection") — the honest state, since the context is no
-- longer part of that member's world.

-- === Categories: events + tasks reference category_id ===
create or replace function private.refile_orphans_on_category_personalize()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  -- Only a shared (owner null) -> personal (owned by a member) transition can
  -- hide a context from the other member; sharing never orphans anything.
  if old.owner_id is null and new.owner_id is not null then
    update public.events
       set category_id = null
     where category_id = new.id
       and owner_id <> new.owner_id;
    update public.tasks
       set category_id = null
     where category_id = new.id
       and owner_id <> new.owner_id;
  end if;
  return new;
end;
$$;

drop trigger if exists categories_refile_orphans on public.categories;
create trigger categories_refile_orphans
  after update of owner_id on public.categories
  for each row
  execute function private.refile_orphans_on_category_personalize();

-- === Collections: tasks reference collection_id (same pattern) ===
create or replace function private.refile_orphans_on_collection_personalize()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if old.owner_id is null and new.owner_id is not null then
    update public.tasks
       set collection_id = null
     where collection_id = new.id
       and owner_id <> new.owner_id;
  end if;
  return new;
end;
$$;

drop trigger if exists collections_refile_orphans on public.collections;
create trigger collections_refile_orphans
  after update of owner_id on public.collections
  for each row
  execute function private.refile_orphans_on_collection_personalize();

-- === One-time backfill: rows already orphaned (idempotent — re-runs are no-ops) ===
update public.events e
   set category_id = null
  from public.categories c
 where e.category_id = c.id
   and c.owner_id is not null
   and c.owner_id <> e.owner_id;

update public.tasks t
   set category_id = null
  from public.categories c
 where t.category_id = c.id
   and c.owner_id is not null
   and c.owner_id <> t.owner_id;

update public.tasks t
   set collection_id = null
  from public.collections col
 where t.collection_id = col.id
   and col.owner_id is not null
   and col.owner_id <> t.owner_id;
