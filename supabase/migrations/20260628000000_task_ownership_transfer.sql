-- Allow transferring a task to the other member of the workspace.
--
-- The single `tasks_write` (FOR ALL) policy required the *new* row's owner_id to
-- equal the current member, which made it impossible to hand a task to someone
-- else. Split it per-command: inserts and deletes still require you to be the
-- owner, but an UPDATE may set owner_id to any member of the same workspace, so
-- the current owner can transfer ownership. (The app moves the whole subtree in
-- one shot; RLS still gates each row on the *old* owner being the current member,
-- so you can only give away tasks you actually own.)
drop policy if exists tasks_write on tasks;

create policy tasks_insert on tasks for insert
  with check (
    workspace_id = private.current_workspace_id()
    and owner_id = private.current_member_id()
  );

create policy tasks_update on tasks for update
  using (
    workspace_id = private.current_workspace_id()
    and owner_id = private.current_member_id()
  )
  with check (
    workspace_id = private.current_workspace_id()
    and exists (
      select 1 from members m
      where m.id = owner_id
        and m.workspace_id = private.current_workspace_id()
    )
  );

create policy tasks_delete on tasks for delete
  using (
    workspace_id = private.current_workspace_id()
    and owner_id = private.current_member_id()
  );
