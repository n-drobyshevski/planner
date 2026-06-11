-- Planner — per-member sleep derivation preferences (v2).
-- (1) Optional dedicated sleep category: when set, only that category's timed
--     events count as sleep for derived nights, replacing the inactive≡sleep
--     heuristic (which any evening inactive block — focus time, a long commute
--     — can pollute). NULL keeps the heuristic.
-- (2) Per-member night window: derived nights collect events between
--     night_window_start_hour on the evening before and night_window_end_hour
--     on the wake day (defaults 20:00 → 12:00), so long sleepers and shift
--     workers move the boundaries instead of losing data past noon.
-- Reuses members_update_self RLS (a member updates only their own row).

alter table members
  add column sleep_category_id uuid references categories(id) on delete set null,
  add column night_window_start_hour smallint not null default 20
    constraint members_night_window_start_range
    check (night_window_start_hour between 12 and 23),
  add column night_window_end_hour smallint not null default 12
    constraint members_night_window_end_range
    check (night_window_end_hour between 4 and 16);
