-- Planner — add the configurable `pink` palette (Settings → Appearance).
-- `pink` is a drenched soft-blossom palette whose every token derives from one
-- base hue, stored per member in `pink_base` (a `#rrggbb` hex, null = the default
-- pink #ec4899). Unlike the Catppuccin flavors it stays light/dark-aware. This is
-- additive: the `palette` CHECK gains 'pink' and a nullable `pink_base` column is
-- added. Reuses the existing members RLS (members_update_self); no new policy.
-- See Palette in lib/types.ts and the [data-palette="pink"] blocks in app/globals.css.

alter table members drop constraint if exists members_palette_check;

alter table members add constraint members_palette_check check (palette in (
  'default',
  'pink',
  'catppuccin-latte',
  'catppuccin-frappe',
  'catppuccin-macchiato',
  'catppuccin-mocha'
));

alter table members
  add column pink_base text
    check (pink_base is null or pink_base ~ '^#[0-9A-Fa-f]{6}$');
