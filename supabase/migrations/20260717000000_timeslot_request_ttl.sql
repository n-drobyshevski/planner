-- Hardening: auto-decline stale pending timeslot requests.
--
-- A share's inbox has a 20-pending cap and per-hour rate limits, but pending rows
-- otherwise live forever — an abuser could fill the cap with old proposals and
-- wedge it. Recreate `submit_timeslot_request` to first auto-decline this share's
-- pending requests older than 30 days, so stale proposals neither clutter the
-- owner's inbox nor count toward the cap. Everything else is byte-for-byte the
-- live definition (search_path pinned, SECURITY DEFINER; the existing anon/
-- authenticated EXECUTE grant is preserved by CREATE OR REPLACE).
create or replace function public.submit_timeslot_request(
  p_token text,
  p_start timestamptz,
  p_end timestamptz,
  p_name text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_share public.public_calendar_shares%rowtype;
  v_recent int;
  v_pending int;
  v_id uuid;
begin
  select * into v_share
  from public.public_calendar_shares
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now());
  if not found then
    raise exception 'invalid_or_expired_token' using errcode = 'P0001';
  end if;

  if p_start is null or p_end is null or p_end <= p_start then
    raise exception 'invalid_time_range' using errcode = 'P0001';
  end if;

  -- Auto-decline this share's long-unanswered pending requests so they neither
  -- pin the inbox nor occupy the pending cap below.
  update public.timeslot_requests
     set status = 'declined', resolved_at = now()
   where share_id = v_share.id
     and status = 'pending'
     and created_at < now() - interval '30 days';

  select count(*) into v_recent
  from public.timeslot_requests
  where share_id = v_share.id and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  select count(*) into v_pending
  from public.timeslot_requests
  where share_id = v_share.id and status = 'pending';
  if v_pending >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.timeslot_requests (
    share_id, workspace_id, owner_id, requester_name, message,
    proposed_start, proposed_end
  )
  values (
    v_share.id, v_share.workspace_id, v_share.owner_id,
    nullif(left(coalesce(p_name, ''), 120), ''),
    nullif(left(coalesce(p_message, ''), 1000), ''),
    p_start, p_end
  )
  returning id into v_id;

  return v_id;
end;
$function$;
