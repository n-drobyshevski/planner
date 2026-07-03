-- Retire members.pin_hash, the legacy unsalted SHA-256 PIN digest.
--
-- members_select is workspace-wide (both members read each other's full row
-- for the account switcher), so any digest stored on members is visible to the
-- partner's browser via the workspace bundle — and an unsalted SHA-256 of a
-- short PIN cracks in milliseconds. Move the remaining un-upgraded digests
-- into member_secrets (owner-only RLS; pre-auth login reads it via the service
-- role), preserving the lazy scrypt upgrade on the member's next successful
-- passphrase login, then drop the column.
--
-- A member_secrets row now holds either secret_hash+secret_salt (scrypt,
-- authoritative) or legacy_pin_sha256 (pending upgrade) — hence the dropped
-- NOT NULLs. setPassphrase always writes both scrypt columns, so scrypt rows
-- stay well-formed.

alter table public.member_secrets
  alter column secret_hash drop not null,
  alter column secret_salt drop not null,
  add column legacy_pin_sha256 text;

comment on column public.member_secrets.legacy_pin_sha256 is
  'Legacy unsalted SHA-256 PIN digest, pending upgrade; cleared when the login path re-hashes the passphrase with scrypt.';

-- Members still on the legacy PIN have pin_hash set and no member_secrets row
-- (the row is only created by the scrypt upgrade, which also nulled pin_hash).
insert into public.member_secrets (member_id, legacy_pin_sha256)
select id, pin_hash from public.members where pin_hash is not null
on conflict (member_id) do nothing;

alter table public.members drop column pin_hash;
