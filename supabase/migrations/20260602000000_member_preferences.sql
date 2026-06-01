-- Planner — per-member appearance preferences
-- Theme + accent color + surface tone, stored on the member's own row.
-- Reuses the existing members RLS (members_update_self lets a member update
-- only their own row), so no new policy or private-schema helper is needed.

alter table members
  add column theme_preference text not null default 'system'
    check (theme_preference in ('light', 'dark', 'system')),
  add column accent text not null default 'terracotta'
    check (accent in ('terracotta', 'teal', 'amber', 'green', 'blue', 'rose', 'violet')),
  add column surface_tone text not null default 'warm'
    check (surface_tone in ('warm', 'neutral', 'cool'));
