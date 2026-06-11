-- Planner — cached AI insight digests (the Optimize tab's narrative summary).
-- One row per member per payload hash: `period_hash` fingerprints the exact
-- aggregate payload (period, filters, numbers) the digest was generated from,
-- so a re-request with unchanged data is a cache hit and never re-calls the
-- model. Digests are derived from the member's own filtered lens, so rows are
-- member-private under RLS (the sleep_logs pattern) — the partner generates
-- their own. The table doubles as the rate-limit ledger: the API route counts
-- a member's rows created today before generating a new one.

create table insight_digests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  period_hash text not null,       -- stable hash of the aggregate payload
  period_label text not null,      -- human label at generation time ("This week")
  digest jsonb not null,           -- validated against lib/insights/digest-schema
  model text not null,             -- model id used, for audit/debugging
  created_at timestamptz not null default now(),
  unique (member_id, period_hash)  -- cache key; upsert target
);
create index insight_digests_member_created_idx
  on insight_digests(member_id, created_at);

alter table insight_digests enable row level security;

-- Member-private (NOT the events pattern): only the owning member, ever.
create policy insight_digests_select on insight_digests for select
  using (member_id = private.current_member_id());
create policy insight_digests_write on insight_digests for all
  using (member_id = private.current_member_id())
  with check (
    workspace_id = private.current_workspace_id()
    and member_id = private.current_member_id()
  );

-- No realtime: digests are request/response, not live-synced state.
grant select, insert, update, delete on table insight_digests to authenticated;
