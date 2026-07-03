-- Drop the migrate-then-deploy compat shim left by 20260719.
--
-- 20260719 (pin_hash_to_member_secrets) was applied to the hosted project
-- while the previous deploy — whose login queries still selected
-- members.pin_hash explicitly — was live, so an all-NULL pin_hash column was
-- re-added out-of-band to keep sign-in working during the window. Apply this
-- AFTER the security-fixes deploy is live to finish the removal.
--
-- `if exists` keeps this idempotent for fresh environments (`supabase db
-- reset`), where 20260719 already dropped the column and no shim was ever
-- added.

alter table public.members drop column if exists pin_hash;
