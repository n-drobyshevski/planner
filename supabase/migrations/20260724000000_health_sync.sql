-- Planner — Fitbit Air (Google Health API) sync.
--
-- Two new tables, both member-private:
--   health_connections — one row per member, holding the OAuth refresh token
--     (encrypted, see lib/health/crypto.ts) plus non-secret connection status.
--     ALL writes go through the service role (the sync job / connect+callback
--     routes) — there is no owner write policy, mirroring the "secret material
--     never touches an RLS write path" precedent from member_secrets
--     (20260711000000_webauthn_credentials.sql). The owner may only ever READ
--     it, and only the non-secret columns: RLS grants the owner row visibility,
--     but a column-level GRANT (not a table-level one) leaves
--     refresh_token_enc unreachable even via `select *` on the base table, and
--     health_connections_public is the shaped, no-secret read surface the app
--     actually queries from the browser.
--   health_daily — one row per member per date, the synced metrics
--     (sleep stages, HRV, resting HR, SpO2, steps, active zone minutes,
--     exercise). Owner-read-only; there is no client write policy at all —
--     only the sync job (service role) ever writes it.
--
-- Plus: sleep_logs gets a `source` column so the sync job's auto-fill (see
-- lib/health/sync.ts) can tell a Fitbit-filled night from a manual one, and
-- never overwrite a manually-entered bedtime/wake time.

-- ---------------------------------------------------------------------------
-- health_connections — member-private, secret-bearing. Service-role writes only.
-- ---------------------------------------------------------------------------
create table health_connections (
  member_id uuid primary key references members(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null default 'google_health',
  health_user_id text,                       -- Google Health `identity.healthUserId`
  scopes text[] not null default '{}',
  refresh_token_enc bytea,                   -- AES-256-GCM ciphertext (lib/health/crypto.ts); NEVER selected by the app role
  status text not null default 'active'
    check (status in ('active', 'revoked', 'error')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table health_connections enable row level security;

-- Row visibility: the owner only (mirrors member_secrets' owner scoping).
create policy health_connections_owner_select on health_connections for select
  using (member_id = private.current_member_id());
-- No insert/update/delete policy for `authenticated` at all: every write
-- (connect, token refresh/rotation, disconnect, error bookkeeping) happens
-- through the service-role client in lib/health/*, which bypasses RLS and so
-- is unaffected by the absence of a write policy here.

-- Column-level secrecy: even though the SELECT policy above would let the
-- owner `select *` and hit RLS's row check, REVOKE + a narrower GRANT stops
-- refresh_token_enc from ever leaving Postgres for the `authenticated` role,
-- independent of any future view or client query shape.
revoke select on health_connections from authenticated, anon;
grant select (
  member_id, workspace_id, provider, health_user_id, scopes,
  status, last_synced_at, last_error, created_at, updated_at
) on health_connections to authenticated;

-- The shaped, no-secret read surface the settings UI actually queries.
-- security_invoker so it runs as the querying role (subject to the RLS policy
-- and column grant above), not as the view owner.
create view health_connections_public
  with (security_invoker = true) as
select
  member_id, workspace_id, provider, health_user_id, scopes,
  status, last_synced_at, last_error, created_at, updated_at
from health_connections;

grant select on health_connections_public to authenticated;

-- ---------------------------------------------------------------------------
-- health_daily — member-private synced metrics. Owner-read-only; no client
-- writes (sync job only, via the service role).
-- ---------------------------------------------------------------------------
create table health_daily (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  date date not null,                        -- zone-free wake/measurement date, like sleep_logs.date

  sleep_start timestamptz,
  sleep_end timestamptz,
  minutes_asleep integer,
  minutes_deep integer,
  minutes_light integer,
  minutes_rem integer,
  minutes_awake integer,
  efficiency numeric,                        -- 0..100

  hrv_ms numeric,
  resting_hr numeric,
  spo2_avg numeric,                          -- 0..100

  steps integer,
  active_zone_minutes integer,
  exercise_minutes integer,

  source jsonb,                              -- device/provider metadata, e.g. {"device": "Fitbit Air"}
  synced_at timestamptz not null default now(),

  unique (member_id, date)
);

alter table health_daily enable row level security;

create policy health_daily_select on health_daily for select
  using (member_id = private.current_member_id());
-- Deliberately no insert/update/delete policy: only the service-role sync job
-- (lib/health/sync.ts) ever writes this table.

alter publication supabase_realtime add table health_daily;
grant select on table health_daily to authenticated;

-- ---------------------------------------------------------------------------
-- sleep_logs: tag whether a night's times came from a check-in, from the
-- Fitbit sync auto-fill, or both (the sync filled bedtime/wake, the member
-- separately rated quality/fatigue). Never touched by the browser write path
-- (lib/supabase/mutations.ts' upsertSleepLog) — only lib/health/sync.ts sets
-- it to 'fitbit' / 'fitbit+manual'; it defaults to 'manual' for ordinary
-- check-ins and stays that way since upsert only SETs the columns it's given.
-- ---------------------------------------------------------------------------
alter table sleep_logs add column if not exists source text not null default 'manual'
  check (source in ('manual', 'fitbit', 'fitbit+manual'));
