-- Defense-in-depth: pin the public share token to exactly 64 hex chars.
--
-- Tokens are generated app-side as two dashless UUIDs (64 hex chars, ~244 bits).
-- The column was unbounded `text NOT NULL UNIQUE`, so a short/weak token could be
-- inserted by an owner-side bug. A CHECK makes the entropy floor a schema
-- invariant rather than an app-only convention. Existing rows already comply
-- (verified: all tokens length 64).
alter table public.public_calendar_shares
  add constraint public_calendar_shares_token_len_chk check (length(token) = 64);
