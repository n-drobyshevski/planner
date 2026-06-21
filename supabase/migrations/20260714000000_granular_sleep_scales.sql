-- Planner — restore granular sleep check-in scales.
--
-- The June "4-level standard" (20260618164310_four_level_scales) collapsed sleep
-- quality 1–5 and the validated Karolinska Sleepiness Scale (1–9) down to 1–4.
-- For self-report scales the psychometric evidence is clear: 2/3/4-point scales
-- discriminate poorly, and reliability/validity/discriminating power plateau
-- around 7 points (Preston & Colman 2000). So we widen back:
--   quality → 1–7  (the psychometric sweet spot)
--   fatigue → 1–9  (restore the Karolinska Sleepiness Scale it used before)
--
-- ONE-TIME forward remap — the value CASEs are NOT idempotent (a re-run would
-- re-stretch already-migrated values). Apply exactly once (the migration ledger
-- enforces this; never replay by hand). The earlier collapse already destroyed
-- the original granularity, so existing 1–4 values are LINEARLY stretched across
-- the new range to keep chart trends and hint comparisons continuous.
--
-- ORDERING (load-bearing): Vercel auto-deploys main, and this DB CHECK is the
-- only range guard besides the UI (sleep logs are written client-side via
-- lib/hooks/use-sleep-logs.ts; there is no server-side schema). Apply this to
-- prod BEFORE pushing the code that writes 5–7 / 5–9 — otherwise those inserts
-- fail the old 1–4 CHECK.

alter table sleep_logs drop constraint sleep_logs_quality_range;
alter table sleep_logs drop constraint sleep_logs_fatigue_range;

-- quality 1–4 → 1–7 (linear stretch: 1→1, 2→3, 3→5, 4→7).
update sleep_logs
set quality = case quality
  when 1 then 1
  when 2 then 3
  when 3 then 5
  when 4 then 7
  else quality
end
where quality is not null;

-- fatigue 1–4 → Karolinska 1–9 (linear stretch: 1→1, 2→4, 3→6, 4→9).
update sleep_logs
set fatigue = case fatigue
  when 1 then 1
  when 2 then 4
  when 3 then 6
  when 4 then 9
  else fatigue
end
where fatigue is not null;

alter table sleep_logs
  add constraint sleep_logs_quality_range check (quality is null or quality between 1 and 7);
alter table sleep_logs
  add constraint sleep_logs_fatigue_range check (fatigue is null or fatigue between 1 and 9);
