-- Durable second line of login throttling. The in-memory ip-bucket limiter is
-- per-instance (Vercel Fluid Compute) and resets on cold start, so a patient
-- or distributed brute-forcer gets a fresh burst per instance while nickname +
-- passphrase guessing yields a full session. Failed auth attempts are recorded
-- here and counted over a sliding window; both the per-IP and per-member axes
-- must stay under budget for an attempt to proceed (see
-- lib/rate-limit/login-attempts.ts).
--
-- Service-role only: RLS is enabled with NO policies and table privileges are
-- revoked, so anon/authenticated can neither read attempt history (a member-
-- enumeration oracle) nor forge rows. The pre-auth login actions reach it via
-- the admin client, which bypasses RLS — same containment as member_secrets.

create table public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text,
  member_id uuid references public.members(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index login_attempts_ip_idx on public.login_attempts (ip, created_at);
create index login_attempts_member_idx on public.login_attempts (member_id, created_at);

alter table public.login_attempts enable row level security;
revoke all on table public.login_attempts from anon, authenticated;
