-- Phase 4 (public sharing) — surface inactive time as an "Unavailable" band.
--
-- Inactive events (sleep / blocked holds) were filtered out of the public read
-- entirely (`and not e.inactive`), so a share showed busy meetings but made nights
-- and early mornings look FREE. We now expose inactive events' TIME RANGE (never
-- their content) so the public view can draw a quiet "Unavailable" band, gated by a
-- new per-share `show_inactive` flag (default on, owner-controllable).
--
-- PRIVACY. Inactive rows are ALWAYS fully redacted (title 'Busy', desc/loc null) in
-- BOTH modes — `details` mode must not leak a sleep/hold title — and private /
-- hidden-from-public events still never surface. So a band exposes only that some
-- time is blocked, mirroring lib/scope/visibility.ts `publicBandVisible`.

alter table public_calendar_shares
  add column show_inactive boolean not null default true;

-- --------------------------------------------------------------------------
-- Strict public read: events. Now includes inactive events when the share opts
-- in (`s.show_inactive`); inactive rows are force-redacted regardless of mode.
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
    and not e.is_private
    and not e.hidden_from_public
    and (not e.inactive or s.show_inactive)
    and (s.category_ids is null or e.category_id = any (s.category_ids))
    and e.starts_at < p_end;
$$;

-- Strict public read: overrides. Same inclusion/redaction rules; only returns
-- overrides whose PARENT event passes the public filter.
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
