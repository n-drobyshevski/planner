-- Planner — unify "context" and "category" into one entity (the UI calls it a
-- "Context"; in the schema it remains the `categories` table).
--
-- Before: an item carried two independent links — `category_id` (a workspace
-- label) and `context_id` (the time-block it sat under, an `events` row with
-- kind='context'). After: there is ONE membership link, `category_id`. A
-- time-block keeps being an `events` row with kind='context', but it now
-- references *which category it paints* through its own `category_id` column.
--
-- This migration is forward-only and non-destructive: every existing time-block
-- keeps its label (promoted to a category) and every child keeps a membership.

-- 1. Promote each existing time-block that has no category into a category, and
--    point the block at it. (events.owner_id is NOT NULL, so the promoted
--    category is personal to the block's owner; a block that already paints a
--    category is left untouched.)
do $$
declare
  b record;
  new_cat uuid;
begin
  for b in
    select id, workspace_id, owner_id, title, color
    from events
    where kind = 'context' and category_id is null
  loop
    insert into categories (workspace_id, owner_id, name, color, sort_order)
    values (
      b.workspace_id,
      b.owner_id,
      coalesce(nullif(btrim(b.title), ''), 'Context'),
      coalesce(b.color, '#0f766e'),
      0
    )
    returning id into new_cat;
    update events set category_id = new_cat where id = b.id;
  end loop;
end $$;

-- 2. Migrate item membership: a child that has no explicit category inherits the
--    category painted by the time-block it was filed under. An explicit
--    category always wins (we only backfill where category_id is null).
update events c
set category_id = b.category_id
from events b
where c.context_id = b.id
  and c.category_id is null
  and b.category_id is not null;

-- 3. Drop the old item->block link. The time-block discriminator (`kind` and the
--    `event_kind` enum) stays; only the per-item context pointer goes away.
alter table events drop constraint if exists events_context_not_nested;
drop index if exists events_context_idx;
alter table events drop column if exists context_id;

-- Speeds up "which time-blocks paint this category" lookups (most rows are not
-- contexts, so keep it partial).
create index if not exists events_context_category_idx
  on events(category_id) where kind = 'context';
