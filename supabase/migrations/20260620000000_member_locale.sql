-- Planner — per-member UI language (i18n locale)
-- Stores the member's chosen interface language so it follows them across
-- devices (the URL `/ru/*` segment renders it; this row is the cross-device
-- source of truth the app reconciles to on load). Defaults to 'en' to preserve
-- the existing experience. Reuses the existing members RLS (members_update_self
-- lets a member update only their own row), so no new policy is needed.

alter table members
  add column locale text not null default 'en'
    check (locale in ('en', 'ru'));
