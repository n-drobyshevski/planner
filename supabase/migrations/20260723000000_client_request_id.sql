-- Idempotency key for machine writers (e.g. Anchor, the Telegram companion's
-- MCP client). A caller that can't tell whether its last `create_event` /
-- `create_task` call landed (dropped response, killed worker, replayed job)
-- passes the same `client_request_id` again; the unique index below rejects
-- the duplicate insert, and the mutation layer (lib/supabase/mutations.ts)
-- catches that 23505 and returns the row already created for it. A plain
-- column, not `attributes` — this is plumbing, not an app-visible field, and
-- keeping it out of the attributes jsonb keeps it out of that schema's
-- registry (lib/attributes/schema.ts).
alter table events add column client_request_id text;
alter table tasks add column client_request_id text;

create unique index events_owner_client_request_id_idx
  on events (owner_id, client_request_id)
  where client_request_id is not null;
create unique index tasks_owner_client_request_id_idx
  on tasks (owner_id, client_request_id)
  where client_request_id is not null;
