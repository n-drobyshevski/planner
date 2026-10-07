-- ---------------------------------------------------------------------------
-- Planner — timeslot request deletes reach the owner's Inbox live.
--
-- 20261009000000_broadcast_deletes_and_editor put timeslot_requests in the
-- realtime publication so the owner's Inbox (the Android app's, with its
-- badge and "New time requests" notifications) follows it over Postgres
-- Changes. A filtered binding never sees a DELETE, though, and that migration
-- gave the table no row_gone trigger: a request that disappears (its share
-- link deleted, which cascades, or the request deleted outright) stayed in
-- the Inbox until the next refetch, and could still be approved.
--
-- The same broadcast_row_gone() now reports those deletes on the workspace's
-- sync topic. The payload is the usual { table, id, kind: 'delete', owner_id,
-- actor }: timeslot_requests is not events/tasks, so no requester name,
-- message or time is ever sent. Like any row_gone, the id and owner reach the
-- partner too (the topic is per workspace), which reveals no content; only
-- the owner's client acts on it.
-- ---------------------------------------------------------------------------
create trigger timeslot_requests_broadcast_delete
  after delete on timeslot_requests
  for each row execute function broadcast_row_gone();
