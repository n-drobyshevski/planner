-- Planner — collapse every poll/rating scale to one 4-level standard.
--
-- Satisfaction 1–5 → 1–4, sleep quality 1–5 → 1–4, fatigue (Karolinska 1–9)
-- → 1–4. Energy 1–3 → 1–4 is an EXPANSION, not a rescale: old 1/2/3 stay valid
-- and a new top level 4 ("Peak") opens above, so no energy rows are rewritten
-- here (lib/attributes/schema.ts only widens the allowed set).
--
-- ORDERING (load-bearing): the app's parseAttributes() silently DROPS any known
-- attribute that fails its zod schema on read. Once the narrowed 1–4 satisfaction
-- schema ships, a stored satisfaction=5 vanishes. Vercel auto-deploys main, so
-- this data migration MUST be applied to the production DB BEFORE the code that
-- narrows the schema is pushed.
--
-- ONE-TIME forward remap — the value CASEs are not idempotent (a re-run would map
-- already-migrated 4→3 again). Apply exactly once (the migration ledger enforces
-- this; never replay by hand).

-- --- jsonb attributes on events + tasks: satisfaction 5→4, 4→3 (3/2/1 unchanged).
update events
set attributes = jsonb_set(
  attributes,
  '{satisfaction}',
  to_jsonb(
    case (attributes->>'satisfaction')::int
      when 5 then 4
      when 4 then 3
      else (attributes->>'satisfaction')::int
    end
  )
)
where attributes ? 'satisfaction'
  and jsonb_typeof(attributes->'satisfaction') = 'number';

update tasks
set attributes = jsonb_set(
  attributes,
  '{satisfaction}',
  to_jsonb(
    case (attributes->>'satisfaction')::int
      when 5 then 4
      when 4 then 3
      else (attributes->>'satisfaction')::int
    end
  )
)
where attributes ? 'satisfaction'
  and jsonb_typeof(attributes->'satisfaction') = 'number';

-- --- sleep_logs smallint columns: drop the old ranges, remap, re-check at 1–4.
alter table sleep_logs drop constraint sleep_logs_quality_range;
alter table sleep_logs drop constraint sleep_logs_fatigue_range;

-- quality 1–5 → 1–4 (same nearest-level map as satisfaction).
update sleep_logs
set quality = case quality when 5 then 4 when 4 then 3 else quality end
where quality is not null;

-- fatigue: Karolinska 1–9 → 1–4 by band (1–2→1, 3–4→2, 5–6→3, 7–9→4).
update sleep_logs
set fatigue = case
  when fatigue <= 2 then 1
  when fatigue <= 4 then 2
  when fatigue <= 6 then 3
  else 4
end
where fatigue is not null;

alter table sleep_logs
  add constraint sleep_logs_quality_range check (quality is null or quality between 1 and 4);
alter table sleep_logs
  add constraint sleep_logs_fatigue_range check (fatigue is null or fatigue between 1 and 4);
