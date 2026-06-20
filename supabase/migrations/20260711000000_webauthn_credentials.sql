-- Passkeys (WebAuthn) + hardened passphrase secrets
-- Replaces the optional, unsalted-SHA256 PIN with two stronger factors that keep
-- the existing Supabase Auth + RLS backbone untouched:
--   1. Passkeys (WebAuthn) — the primary, phishing-resistant, device-bound factor.
--      This is the real upgrade: knowing a nickname no longer grants a session.
--   2. A salted-scrypt secret (the PIN, re-hashed) — fallback for enrollment/recovery.
-- Identity resolution (auth.uid(), private.current_member_id/workspace_id) and every
-- RLS policy are unchanged: this only swaps the "prove you are this member" factor in
-- front of the unchanged session-minting bridge.
--
-- Secret material lives in OWNER-ONLY tables, not on `members` — because members_select
-- lets each member read the other's full row, so a hash on `members` would leak to the
-- partner. Mirrors the member-private member_sleep_prefs precedent. `members` carries only
-- non-sensitive booleans (has_secret / has_passkey) that the account switcher UI needs.

-- ---------------------------------------------------------------------------
-- Safe-to-expose flags on members (no secret material).
-- ---------------------------------------------------------------------------
alter table members add column if not exists has_secret boolean not null default false;
alter table members add column if not exists has_passkey boolean not null default false;
-- Backfill from the legacy PIN so existing gated members keep showing as gated.
update members set has_secret = true where pin_hash is not null;

-- ---------------------------------------------------------------------------
-- Member-private passphrase secret (salted scrypt). Owner-only RLS; pre-auth
-- verification runs through the service-role client, which bypasses RLS.
-- ---------------------------------------------------------------------------
create table member_secrets (
  member_id uuid primary key references members(id) on delete cascade,
  secret_hash text not null,                 -- scrypt digest (hex)
  secret_salt text not null,                 -- per-member random salt (hex)
  updated_at timestamptz not null default now()
);
alter table member_secrets enable row level security;
create policy member_secrets_rw on member_secrets for all
  using (member_id = private.current_member_id())
  with check (member_id = private.current_member_id());

-- ---------------------------------------------------------------------------
-- Passkeys: one row per registered authenticator. Keyed by member_id, so this
-- generalizes to N members if the app ever grows past the fixed pair.
-- ---------------------------------------------------------------------------
create table webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  credential_id text not null unique,        -- base64url credential id
  public_key text not null,                  -- base64url COSE public key
  counter bigint not null default 0,         -- signature counter (clone detection)
  transports text[],                         -- e.g. {internal, hybrid, usb}
  label text,                                -- user-facing device name
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index webauthn_credentials_member_idx on webauthn_credentials(member_id);

alter table webauthn_credentials enable row level security;

-- A member manages only their own credentials. Pre-auth registration/verification
-- runs through the service-role client (bypasses RLS) exactly like the current PIN
-- lookup, so no anon-facing policy or RPC is required.
create policy webauthn_select on webauthn_credentials for select
  using (member_id = private.current_member_id());
create policy webauthn_write on webauthn_credentials for all
  using (member_id = private.current_member_id())
  with check (member_id = private.current_member_id());
