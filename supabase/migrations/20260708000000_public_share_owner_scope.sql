-- Phase 4 (public sharing) — scope a share to ITS CREATOR's calendar.
--
-- The public-read RPCs joined events to the share by workspace alone
-- (`join events e on e.workspace_id = s.workspace_id`), with no owner filter. In a
-- two-member workspace that leaked the OTHER member's calendar: a viewer of Alice's
-- link saw every non-private / non-hidden event in the workspace, including Bob's
-- solo events and his personal "Unavailable" bands — exposure Alice never consented to.
--
-- A share now returns only the creator's own rows PLUS JOINT events (shared by either
-- partner). Jointness mirrors the write-policy invariant in 20260607 / 20260608: a
-- non-private event is joint iff `is_shared` OR it sits under a Shared context
-- (`categories.owner_id is null`). The pre-existing `and not e.is_private` guard still
-- runs unconditionally, so a private event under a Shared context stays owner-only and
-- nothing marked Private is exposed.
--
-- The Shared-context check is INLINED here rather than calling
-- private.is_shared_category(): that helper is granted to `authenticated` only, never
-- `anon`. These RPCs are SECURITY DEFINER and already read public.events with the
-- definer's (RLS-bypassing) privileges, so reading public.categories the same way needs
-- no new grant. Everything else — token/expiry/revocation checks, privacy/hidden/inactive
-- filters, category scoping, mode redaction — is byte-for-byte unchanged. Signature is
-- unchanged (rows only narrow), so this is backward-compatible with the deployed app.

-- --------------------------------------------------------------------------
-- Strict public read: events. Creator-owned OR joint only.
-- --------------------------------------------------------------------------
create or replace function public.public_calendar_events(
  p_token text,
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  id uuid,
  workspace_id uuid,
  owner_id uuid,
  category_id uuid,
  title text,
  description text,
  location text,
  is_private boolean,
  is_shared boolean,
  hidden_from_public boolean,
  color text,
  kind event_kind,
  all_day boolean,
  inactive boolean,
  status event_status,
  starts_at timestamptz,
  ends_at timestamptz,
  time_zone text,
  rrule text,
  recurrence_ends_at timestamptz,
  task_id uuid,
  attributes jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id, e.workspace_id, e.owner_id, e.category_id,
    case when s.mode = 'busy' or e.inactive then 'Busy' else e.title end,
    case when s.mode = 'busy' or e.inactive then null else e.description end,
    case when s.mode = 'busy' or e.inactive then null else e.location end,
    e.is_private, e.is_shared, e.hidden_from_public, e.color, e.kind,
    e.all_day, e.inactive, e.status, e.starts_at, e.ends_at, e.time_zone,
    e.rrule, e.recurrence_ends_at, e.task_id, e.attributes,
    e.created_at, e.updated_at
  from public.public_calendar_shares s
  join public.events e on e.workspace_id = s.workspace_id
  where s.token = p_token
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now())
    and (
      e.owner_id = s.owner_id
      or e.is_shared
      or exists (
        select 1 from public.categories c
        where c.id = e.category_id and c.owner_id is null
      )
    )
    and not e.is_private
    and not e.hidden_from_public
    and (not e.inactive or s.show_inactive)
    and (s.category_ids is null or e.category_id = any (s.category_ids))
    and e.starts_at < p_end;
$$;

-- Strict public read: overrides. Same creator-owned-OR-joint gate on the PARENT
-- event, so overrides of the other member's solo events stop leaking too.
create or replace function public.public_calendar_overrides(
  p_token text,
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  id uuid,
  workspace_id uuid,
  event_id uuid,
  occurrence_date timestamptz,
  type override_type,
  title text,
  description text,
  location text,
  category_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id, o.workspace_id, o.event_id, o.occurrence_date, o.type,
    case when (s.mode = 'busy' or e.inactive) and o.title is not null then 'Busy' else o.title end,
    case when s.mode = 'busy' or e.inactive then null else o.description end,
    case when s.mode = 'busy' or e.inactive then null else o.location end,
    o.category_id, o.starts_at, o.ends_at, o.all_day
  from public.public_calendar_shares s
  join public.events e on e.workspace_id = s.workspace_id
  join public.event_overrides o on o.event_id = e.id
  where s.token = p_token
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now())
    and (
      e.owner_id = s.owner_id
      or e.is_shared
      or exists (
        select 1 from public.categories c
        where c.id = e.category_id and c.owner_id is null
      )
    )
    and not e.is_private
    and not e.hidden_from_public
    and (not e.inactive or s.show_inactive)
    and (s.category_ids is null or e.category_id = any (s.category_ids))
    and e.starts_at < p_end;
$$;

-- The functions remain the only public-read surface granted to anonymous callers.
revoke all on function public.public_calendar_events(text, timestamptz, timestamptz) from public;
revoke all on function public.public_calendar_overrides(text, timestamptz, timestamptz) from public;
grant execute on function public.public_calendar_events(text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.public_calendar_overrides(text, timestamptz, timestamptz) to anon, authenticated;
