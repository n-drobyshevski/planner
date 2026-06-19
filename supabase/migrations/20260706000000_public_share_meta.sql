-- Phase 4 (public sharing) — share metadata for the public page.
--
-- The read RPCs return no rows for both an invalid token AND an empty calendar, so
-- the public page can't tell "this link is dead" from "nothing scheduled." This
-- tiny SECURITY DEFINER function exposes ONLY non-sensitive link metadata (does it
-- exist + is it active, its label, its redaction mode) so the page can render a
-- calm "this link is no longer active" state and gate the request dialog. It never
-- exposes any calendar data. Returns 0 rows when the token doesn't exist.

create or replace function public.public_share_meta(p_token text)
returns table (active boolean, label text, mode text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (s.revoked_at is null and (s.expires_at is null or s.expires_at > now())) as active,
    s.label,
    s.mode
  from public.public_calendar_shares s
  where s.token = p_token;
$$;

revoke all on function public.public_share_meta(text) from public;
grant execute on function public.public_share_meta(text) to anon, authenticated;
