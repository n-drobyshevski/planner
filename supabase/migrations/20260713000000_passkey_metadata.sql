-- Passkey distinguishing metadata, captured at registration.
-- Two members across several devices can't otherwise tell their credentials apart;
-- these columns record WHAT KIND (authenticator provider via AAGUID, synced vs
-- device-bound) and WHERE/WHEN (browser + OS at creation; created_at already exists).
-- Additive and nullable — existing rows keep working and fall back to a generic label.
-- RLS unchanged (owner-only, from 20260711).

alter table webauthn_credentials add column if not exists aaguid text;          -- authenticator model id
alter table webauthn_credentials add column if not exists device_type text;     -- singleDevice | multiDevice
alter table webauthn_credentials add column if not exists backed_up boolean;    -- synced/backed up to a provider
alter table webauthn_credentials add column if not exists created_os text;      -- OS at enrollment (from UA)
alter table webauthn_credentials add column if not exists created_browser text; -- browser at enrollment (from UA)
