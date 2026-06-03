-- Per-member "show success toasts" preference. Confirmation toasts can feel
-- noisy; members can mute them while error/warning toasts still show.
-- Defaults true to preserve current behavior. Reuses members RLS.
alter table members
  add column show_success_toasts boolean not null default true;
