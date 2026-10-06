-- ---------------------------------------------------------------------------
-- Planner — updated_at grows in commit order, row by row.
--
-- set_updated_at() stamped now(), the time the transaction STARTED. When two
-- members save the same row at the same moment, the transaction that started
-- first can commit last (it waits on the row lock, then applies on top), so
-- the row ends up holding the newer content under the OLDER timestamp. The
-- Android client skips a Realtime row older than the one it cached (its echo
-- guard), so the member whose write committed first kept showing content the
-- server no longer had.
--
-- A BEFORE UPDATE trigger runs once the row is locked and sees the latest
-- committed version as OLD, so stamping at least one microsecond past it
-- makes every later commit of a row carry a strictly later updated_at. It
-- stays now() otherwise (the same stamp for every row a statement touches).
-- Inserts (OLD is null) are unchanged. The optimistic-concurrency guards
-- only compare against the value a client read back, so they are unaffected.
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at = greatest(now(), old.updated_at + interval '1 microsecond');
  else
    new.updated_at = now();
  end if;
  return new;
end;
$$;
