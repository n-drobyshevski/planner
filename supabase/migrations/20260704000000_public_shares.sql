-- Phase 4 (public sharing) — share-by-link backbone.
--
-- `public_calendar_shares`: an owner-managed link that exposes a READ-ONLY slice of
-- the workspace calendar to anonymous viewers. The link is anonymous (anyone with
-- the URL); `label` is just the owner's memo. `mode` = details|busy controls title
-- redaction; `category_ids` (null = all) narrows which categories show.
--
-- SECURITY. The anon read path has NO member RLS context, so it CANNOT rely on the
-- events_select policy. Instead two SECURITY DEFINER functions apply a STRICT
-- server-side filter and busy-mode redaction in SQL, and are the ONLY thing granted
-- to `anon`. They can never return a private / hidden-from-public / inactive event,
-- and in busy mode never emit a real title/description/location — so even a direct
-- RPC call with the token cannot leak. The table itself is owner-only (RLS); `anon`
-- has no access to it except through the functions. Mirrors lib/scope/visibility.ts
-- `publicVisible` / `redactForPublic` exactly (parity is unit-tested).

create table public_calendar_shares (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_id uuid not null references members(id) on delete cascade,
  -- 64 hex chars (~244 bits) from two UUIDs — unguessable, no pgcrypto dependency.
  token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  label text,                                   -- owner's memo, e.g. "Family"
  mode text not null default 'details' check (mode in ('details', 'busy')),
  category_ids uuid[],                          -- null = all permitted categories
  expires_at timestamptz,                       -- null = never expires
  revoked_at timestamptz,                       -- non-null = permanently disabled
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index public_calendar_shares_workspace_idx on public_calendar_shares(workspace_id);
create index public_calendar_shares_token_idx on public_calendar_shares(token);

create trigger public_calendar_shares_set_updated_at
  before update on public_calendar_shares
  for each row execute function set_updated_at();

-- Only the owner manages their own shares. No anon access to the table.
alter table public_calendar_shares enable row level security;
create policy shares_select on public_calendar_shares for select
  using (
    workspace_id = private.current_workspace_id()
    and owner_id = private.current_member_id()
  );
create policy shares_write on public_calendar_shares for all
  using (
    workspace_id = private.current_workspace_id()
    and owner_id = private.current_member_id()
  )
  with check (
    workspace_id = private.current_workspace_id()
    and owner_id = private.current_member_id()
  );

-- --------------------------------------------------------------------------
-- Strict public read: events. Validates the token, then returns ONLY events
-- that pass the public filter, with busy-mode redaction applied in SQL. The
-- projection mirrors the events columns `mapEvent` reads. Window prune mirrors
-- fetchWindow (`starts_at < p_end`); the client applies the end-overlap test.
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
    case when s.mode = 'busy' then 'Busy' else e.title end,
    case when s.mode = 'busy' then null else e.description end,
    case when s.mode = 'busy' then null else e.location end,
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
    and not e.inactive
    and (s.category_ids is null or e.category_id = any (s.category_ids))
    and e.starts_at < p_end;
$$;

-- Strict public read: overrides. Same validation/redaction; only returns overrides
-- whose PARENT event passes the public filter (so cancels/edits of private events
-- never leak through). Projection mirrors `mapOverride`.
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
    case when s.mode = 'busy' and o.title is not null then 'Busy' else o.title end,
    case when s.mode = 'busy' then null else o.description end,
    case when s.mode = 'busy' then null else o.location end,
    o.category_id, o.starts_at, o.ends_at, o.all_day
  from public.public_calendar_shares s
  join public.events e on e.workspace_id = s.workspace_id
  join public.event_overrides o on o.event_id = e.id
  where s.token = p_token
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now())
    and not e.is_private
    and not e.hidden_from_public
    and not e.inactive
    and (s.category_ids is null or e.category_id = any (s.category_ids))
    and e.starts_at < p_end;
$$;

-- The functions are the only public-read surface granted to anonymous callers.
revoke all on function public.public_calendar_events(text, timestamptz, timestamptz) from public;
revoke all on function public.public_calendar_overrides(text, timestamptz, timestamptz) from public;
grant execute on function public.public_calendar_events(text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.public_calendar_overrides(text, timestamptz, timestamptz) to anon, authenticated;
