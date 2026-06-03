-- Planner — per-member "context label" display variant
-- Picks how a context time-block is labelled in the week/day grid: the default
-- horizontal title bar across the top (`bar`), or a vertical strip on the right
-- edge with the name rotated so the glyph-tops face left (`side`). Defaults to
-- `bar` to preserve the existing look. Reuses the existing members RLS
-- (members_update_self lets a member update only their own row), so no new
-- policy is needed.

alter table members
  add column context_label text not null default 'bar'
    check (context_label in ('bar', 'side'));
