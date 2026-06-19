-- Phase 4 (public sharing) — request-a-timeslot write path.
--
-- A public viewer proposes a time on a share link → a `timeslot_requests` row that
-- surfaces in the owner's (Phase 2) Inbox, where it can be approved (→ creates an
-- event) or declined.
--
-- SECURITY. This is an UNAUTHENTICATED insert. There is NO anon insert policy on
-- the table; the row is created ONLY through the SECURITY DEFINER `submit_timeslot_request`
-- function, which validates the token (active) and enforces rate limits (≤5/hour
-- per share, ≤20 pending per share) — abuse protection that can't be bypassed by
-- calling the table directly. RLS makes pending requests visible/updatable ONLY to
-- the share's owner, so one household never sees another's requests. The API route
-- adds a coarse per-IP throttle on top.

create table timeslot_requests (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public_calendar_shares(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_id uuid not null references members(id) on delete cascade,
  requester_name text,
  message text,
  proposed_start timestamptz not null,
  proposed_end timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint timeslot_requests_time_order check (proposed_end > proposed_start)
);
create index timeslot_requests_owner_idx on timeslot_requests(workspace_id, owner_id, status);
create index timeslot_requests_share_idx on timeslot_requests(share_id, created_at);

-- Owner-only visibility/management. No INSERT policy → no one writes directly; the
-- submit function (SECURITY DEFINER) is the only insert path.
alter table timeslot_requests enable row level security;
create policy requests_select on timeslot_requests for select
  using (
    workspace_id = private.current_workspace_id()
    and owner_id = private.current_member_id()
  );
create policy requests_update on timeslot_requests for update
  using (
    workspace_id = private.current_workspace_id()
    and owner_id = private.current_member_id()
  )
  with check (
    workspace_id = private.current_workspace_id()
    and owner_id = private.current_member_id()
  );
create policy requests_delete on timeslot_requests for delete
  using (
    workspace_id = private.current_workspace_id()
    and owner_id = private.current_member_id()
  );

-- Unauthenticated insert, gated + rate-limited. Returns the new request id, or
-- raises (invalid_or_expired_token / invalid_time_range / rate_limited).
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
set search_path = ''
as $$
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

  -- ≤5 requests per share in the last hour.
  select count(*) into v_recent
  from public.timeslot_requests
  where share_id = v_share.id and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- ≤20 outstanding pending requests per share.
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
$$;

revoke all on function public.submit_timeslot_request(text, timestamptz, timestamptz, text, text) from public;
grant execute on function public.submit_timeslot_request(text, timestamptz, timestamptz, text, text) to anon, authenticated;
