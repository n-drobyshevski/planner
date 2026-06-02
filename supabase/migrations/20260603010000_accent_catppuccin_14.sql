-- Planner — expand the accent palette to the 14 Catppuccin accent colors.
-- The accent ids are renamed to Catppuccin names; existing rows are remapped
-- (terracotta→peach, amber→yellow, rose→pink, violet→mauve; blue/teal/green
-- unchanged) and the default becomes 'peach' (the warm brand terracotta).
-- See AccentId in lib/types.ts and the [data-accent] blocks in app/globals.css.

alter table members drop constraint if exists members_accent_check;

update members set accent = case accent
  when 'terracotta' then 'peach'
  when 'amber' then 'yellow'
  when 'rose' then 'pink'
  when 'violet' then 'mauve'
  else accent
end;

alter table members alter column accent set default 'peach';

alter table members add constraint members_accent_check check (accent in (
  'rosewater', 'flamingo', 'pink', 'mauve', 'red', 'maroon', 'peach',
  'yellow', 'green', 'teal', 'sky', 'sapphire', 'blue', 'lavender'
));
