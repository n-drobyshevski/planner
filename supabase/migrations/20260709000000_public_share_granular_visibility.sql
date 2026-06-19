-- Phase 4 (public sharing) — granular per-axis visibility.
--
-- The single `mode` enum ('details' | 'busy') was too coarse: it bundled three
-- independent disclosures — event TITLES, event DESCRIPTIONS/LOCATIONS, and
-- CONTEXT-WINDOW NAMES (the labelled day-structure bands: Work, Sleep, Gym) — into
-- one switch. An owner who wanted to show the SHAPE of their day (named bands)
-- while hiding the individual events couldn't: 'busy' flattened the context names
-- to 'Busy' too.
--
-- We split `mode` into three independent booleans (alongside the existing
-- `show_inactive`). `mode` is KEPT as a vestigial column so a not-yet-redeployed
-- client can still read/write it during the migrate-then-deploy window; a later
-- migration can drop it. Existing links are backfilled to their exact prior
-- behavior: 'busy' hid all three, 'details' showed all three.
--
-- INVARIANTS preserved from 20260707 / 20260708 (byte-for-byte in the WHERE):
--   owner-or-joint scope, private/hidden-from-public exclusion, show_inactive
--   gating, category allow-list, expiry/revocation. Only the redaction
--   expressions change. RPC SIGNATURES ARE UNCHANGED (column lists identical), so
--   this is backward-compatible with the deployed app.
--
-- New redaction rules (titles):
--   * context rows  → real name when `show_context_names` AND active, else 'Busy'.
--   * event rows    → real title when `show_event_titles` AND active, else 'Busy'.
--   * descriptions/locations (events only) → shown only when titles AND details
--     are both on and the row is active. Gating desc/loc on titles prevents a
--     hidden-title 'Busy' block from leaking its content through the description.
--   * inactive rows stay fully redacted regardless of the switches (inactive =
--     "place, not content"), matching 20260707.

-- Default FALSE is fail-safe: a row inserted without these columns (only a
-- not-yet-redeployed client does that, during the migrate-then-deploy window)
-- defaults to least-disclosure rather than full exposure. The redeployed app
-- always sets all three explicitly, and the form still defaults new links to
-- "show everything" at the UI layer — so the normal flow is unaffected.
alter table public.public_calendar_shares
  add column show_event_titles  boolean not null default false,
  add column show_event_details boolean not null default false,
  add column show_context_names boolean not null default false;

-- Preserve each existing link's behavior: 'busy' hid all three disclosures.
update public.public_calendar_shares
  set show_event_titles  = (mode = 'details'),
      show_event_details = (mode = 'details'),
      show_context_names = (mode = 'details');

-- --------------------------------------------------------------------------
-- Strict public read: events. Per-axis redaction; same owner-or-joint scope.
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
    case
      when e.kind = 'context'
        then case when s.show_context_names and not e.inactive then e.title else 'Busy' end
      else case when s.show_event_titles and not e.inactive then e.title else 'Busy' end
    end,
    case when e.kind = 'event' and s.show_event_titles and s.show_event_details and not e.inactive
         then e.description else null end,
    case when e.kind = 'event' and s.show_event_titles and s.show_event_details and not e.inactive
         then e.location else null end,
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

-- Strict public read: overrides. Same per-axis redaction, keyed on the PARENT
-- event's kind / inactive flag; same owner-or-joint gate on the parent.
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
    case
      when o.title is null then null
      when e.kind = 'context'
        then case when s.show_context_names and not e.inactive then o.title else 'Busy' end
      else case when s.show_event_titles and not e.inactive then o.title else 'Busy' end
    end,
    case when e.kind = 'event' and s.show_event_titles and s.show_event_details and not e.inactive
         then o.description else null end,
    case when e.kind = 'event' and s.show_event_titles and s.show_event_details and not e.inactive
         then o.location else null end,
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
