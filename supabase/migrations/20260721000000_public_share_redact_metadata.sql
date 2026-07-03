-- Public sharing — stop projecting internal metadata to anonymous viewers.
--
-- Even with every disclosure toggle off, public_calendar_events returned each
-- event's raw `attributes` jsonb (energy/focus/satisfaction ratings — personal
-- signals the owner chose to hide), `task_id` (links a calendar block to a
-- task), and `created_at`/`updated_at` (activity timing). None of these are
-- rendered by the public share page, so they are now projected as NULL
-- unconditionally — an anonymous viewer needs the block's place and shape, not
-- its provenance. The app's mapEvent tolerates the NULLs (attributes → {},
-- task_id → null, timestamps unused on the share surface).
--
-- public_calendar_overrides never projected these columns, so it is unchanged.
--
-- Everything else is byte-for-byte 20260709: same signature (23 columns, so
-- the deployed client's rpc() calls are unaffected), same owner-or-joint
-- scope, private/hidden exclusion, show_inactive gating, category allow-list,
-- expiry/revocation, and per-axis title/description/location redaction.

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
    e.rrule, e.recurrence_ends_at,
    null::uuid,        -- task_id: internal linkage, never rendered publicly
    null::jsonb,       -- attributes: personal ratings, redacted unconditionally
    null::timestamptz, -- created_at: activity timing
    null::timestamptz  -- updated_at: activity timing
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

-- create or replace preserves existing grants, but keep the surface explicit
-- (matches every prior recreation of this function).
revoke all on function public.public_calendar_events(text, timestamptz, timestamptz) from public;
grant execute on function public.public_calendar_events(text, timestamptz, timestamptz) to anon, authenticated;
