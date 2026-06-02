-- Planner — per-member full-palette theme (Catppuccin support)
-- Adds a `palette` column alongside the existing theme/accent/surface_tone prefs
-- (see 20260602000000_member_preferences.sql). `default` keeps the native warm
-- system; the four Catppuccin flavors override the entire palette. Reuses the
-- existing members RLS (members_update_self), so no new policy is needed.

alter table members
  add column palette text not null default 'default'
    check (palette in (
      'default',
      'catppuccin-latte',
      'catppuccin-frappe',
      'catppuccin-macchiato',
      'catppuccin-mocha'
    ));
