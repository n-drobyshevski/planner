-- Planner — per-member app view settings that follow the member, not the
-- device: the partner-events toggle, the agenda's Day/Week mode, and the
-- Insights filters (hidden contexts, include inactive blocks).
--
-- The Android app keeps these in on-device DataStore files for instant,
-- offline reads; this row is their account copy, so they survive an
-- uninstall / reinstall (Android backup is off on purpose: the session
-- tokens are Keystore-encrypted) and reach the member's other devices live.
--
-- Member-private under RLS, like insights_prefs: these are personal view
-- choices, not facts about the couple, so they are not columns on `members`
-- (which the partner can read). `insights_hidden_category_ids` is text[]
-- rather than uuid[] so a client-side sentinel id never fails the write.

create table member_app_prefs (
  member_id uuid primary key references members(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  show_partner_events boolean not null default true,
  agenda_mode text not null default 'day',
  insights_hidden_category_ids text[] not null default '{}',
  insights_include_inactive boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint member_app_prefs_agenda_mode check (agenda_mode in ('day', 'week')),
  constraint member_app_prefs_hidden_len check (cardinality(insights_hidden_category_ids) <= 500)
);

-- Covers the workspace_id foreign key (workspace deletes cascade through it).
create index member_app_prefs_workspace_idx on member_app_prefs(workspace_id);

-- Reuses the shared set_updated_at() from the init migration.
create trigger member_app_prefs_set_updated_at
  before update on member_app_prefs
  for each row execute function set_updated_at();

alter table member_app_prefs enable row level security;

-- Member-private: only the owning member, ever.
create policy member_app_prefs_select on member_app_prefs for select
  using (member_id = private.current_member_id());
create policy member_app_prefs_write on member_app_prefs for all
  using (member_id = private.current_member_id())
  with check (
    workspace_id = private.current_workspace_id()
    and member_id = private.current_member_id()
  );

-- Realtime (RLS applies, so the partner's client never receives the row) +
-- Data API grants, same as insights_prefs.
alter publication supabase_realtime add table member_app_prefs;
grant select, insert, update, delete on table member_app_prefs to authenticated;
