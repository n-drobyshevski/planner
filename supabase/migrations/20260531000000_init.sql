-- Planner — initial schema, RLS, and realtime setup
-- Calendar model: one workspace, exactly 2 members. Events are `shared` or
-- `personal`; personal events are `private` (owner only) or `shared` (both see).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type event_scope as enum ('shared', 'personal');
create type event_visibility as enum ('private', 'shared');
create type override_type as enum ('cancel', 'modify');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  color text not null,            -- member accent hex
  pin_hash text,                  -- optional sha-256 of 4-digit PIN (UX gate only)
  created_at timestamptz not null default now()
);
create index members_workspace_idx on members(workspace_id);

create table categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_id uuid references members(id) on delete cascade, -- null = shared category
  name text not null,
  color text not null,
  sort_order int not null default 0
);
create index categories_workspace_idx on categories(workspace_id);

create table events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_id uuid not null references members(id) on delete cascade, -- drives edit rights
  category_id uuid references categories(id) on delete set null,
  title text not null,
  description text,
  location text,
  scope event_scope not null,
  visibility event_visibility not null,           -- shared scope => 'shared'
  all_day boolean not null default false,
  starts_at timestamptz not null,                 -- master / first-occurrence start (UTC)
  ends_at timestamptz not null,
  time_zone text not null,                         -- IANA, for DST-correct expansion
  rrule text,                                      -- RFC5545 RRULE (no DTSTART); null = single event
  recurrence_ends_at timestamptz,                  -- denormalized last occ for window pruning; null = open-ended
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_order check (ends_at >= starts_at)
);
create index events_workspace_starts_idx on events(workspace_id, starts_at); -- main window read
create index events_owner_idx on events(owner_id);

create table event_overrides (   -- EXDATE-style cancels + per-occurrence edits
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  occurrence_date timestamptz not null,            -- ORIGINAL occurrence start (the key)
  type override_type not null,
  title text,
  description text,
  location text,
  category_id uuid references categories(id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean,
  unique (event_id, occurrence_date)
);
create index event_overrides_event_idx on event_overrides(event_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger for events
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_set_updated_at
  before update on events
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Identity helpers (the seam for real auth: only this resolution changes).
-- Kept in a PRIVATE schema so they are NOT exposed on the Data API (/rest/v1/rpc)
-- but remain executable by `authenticated` for RLS evaluation. SECURITY DEFINER
-- so they bypass RLS on `members` and avoid policy recursion.
-- ---------------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.current_member_id() returns uuid
  language sql stable security definer set search_path = '' as $$
  select id from public.members where auth_user_id = auth.uid()
$$;
create or replace function private.current_workspace_id() returns uuid
  language sql stable security definer set search_path = '' as $$
  select workspace_id from public.members where auth_user_id = auth.uid()
$$;
revoke all on function private.current_member_id() from public;
revoke all on function private.current_workspace_id() from public;
grant execute on function private.current_member_id() to authenticated;
grant execute on function private.current_workspace_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table workspaces enable row level security;
alter table members enable row level security;
alter table categories enable row level security;
alter table events enable row level security;
alter table event_overrides enable row level security;

-- Workspaces: members may read their own workspace.
create policy workspaces_select on workspaces for select
  using (id = private.current_workspace_id());

-- Members: both members may read each other; a member may update only their own row.
create policy members_select on members for select
  using (workspace_id = private.current_workspace_id());
create policy members_update_self on members for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- Categories: shared (owner null) editable by both; personal categories by owner.
create policy categories_select on categories for select
  using (
    workspace_id = private.current_workspace_id()
    and (owner_id is null or owner_id = private.current_member_id())
  );
create policy categories_write on categories for all
  using (
    workspace_id = private.current_workspace_id()
    and (owner_id is null or owner_id = private.current_member_id())
  )
  with check (
    workspace_id = private.current_workspace_id()
    and (owner_id is null or owner_id = private.current_member_id())
  );

-- Events: the policy that makes "private" actually private.
create policy events_select on events for select
  using (
    workspace_id = private.current_workspace_id()
    and (
      scope = 'shared'
      or owner_id = private.current_member_id()
      or (scope = 'personal' and visibility = 'shared')
    )
  );
-- Write: you own it, or it is a shared-scope event (both may edit shared).
create policy events_write on events for all
  using (
    workspace_id = private.current_workspace_id()
    and (owner_id = private.current_member_id() or scope = 'shared')
  )
  with check (
    workspace_id = private.current_workspace_id()
    and (owner_id = private.current_member_id() or scope = 'shared')
  );

-- Overrides inherit the parent event's rights.
create policy overrides_select on event_overrides for select
  using (
    exists (
      select 1 from events e
      where e.id = event_overrides.event_id
        and e.workspace_id = private.current_workspace_id()
        and (
          e.scope = 'shared'
          or e.owner_id = private.current_member_id()
          or (e.scope = 'personal' and e.visibility = 'shared')
        )
    )
  );
create policy overrides_write on event_overrides for all
  using (
    exists (
      select 1 from events e
      where e.id = event_overrides.event_id
        and e.workspace_id = private.current_workspace_id()
        and (e.owner_id = private.current_member_id() or e.scope = 'shared')
    )
  )
  with check (
    exists (
      select 1 from events e
      where e.id = event_overrides.event_id
        and e.workspace_id = private.current_workspace_id()
        and (e.owner_id = private.current_member_id() or e.scope = 'shared')
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime: broadcast event + override changes. RLS is enforced for realtime,
-- so a private event of member A is never delivered to member B's client.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table events;
alter publication supabase_realtime add table event_overrides;
alter publication supabase_realtime add table categories;

-- ---------------------------------------------------------------------------
-- Data API grants. RLS still governs which rows are visible; these grants make
-- the tables reachable by the signed-in (authenticated) role. No anon access.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  workspaces, members, categories, events, event_overrides to authenticated;
