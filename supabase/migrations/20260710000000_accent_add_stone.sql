-- Planner — add warm `stone` as a valid accent and make it the brand default.
-- Stone (warm stone-600 #57534e / dark stone-400 #a8a29e) replaces terracotta as
-- the single committed brand accent; terracotta is demoted to Member A's identity
-- and stays selectable as `peach`. This is additive: existing rows are NOT
-- remapped, so members who saved accent='peach' keep terracotta. Only the allowed
-- set and the column default change.
-- See AccentId in lib/types.ts and the [data-accent] blocks in app/globals.css.

alter table members drop constraint if exists members_accent_check;

alter table members alter column accent set default 'stone';

alter table members add constraint members_accent_check check (accent in (
  'rosewater', 'flamingo', 'pink', 'mauve', 'red', 'maroon', 'peach',
  'yellow', 'green', 'teal', 'sky', 'sapphire', 'blue', 'lavender', 'stone'
));
