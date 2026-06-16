-- Planner — flow milestone checkpoints.
--
-- A *checkpoint* is a user-placed marker at a date along a top-level task's
-- trunk in the Flows view ("Beta freeze" on the "Launch" flow). A task HAS MANY
-- checkpoints. This is distinct from `tasks.is_milestone` (which makes a WHOLE
-- task a single point-lane); that flag is untouched here.
--
-- `at_date` is a zone-free calendar-date token (like tasks.due_date /
-- start_date), rendered at UTC midnight so it lands on the same day gridline for
-- every viewer. `shape` carries marker meaning (never color alone). Unlike
-- task_status_events (trigger-written, select-only), checkpoints are written by
-- the client, so they get full read+write RLS — scoped THROUGH the parent task
-- so a private task's checkpoints inherit its visibility (mirrors how boards
-- scope through their collection).

create table task_checkpoints (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references tasks(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title        text not null default '',
  -- zone-free "yyyy-MM-dd" token; UTC midnight at render time.
  at_date      date not null,
  -- reached state. `reached` is the authoritative flag the UI keys on;
  -- `reached_at` is the stamp the toggle set it true (audit/sort), null while open.
  reached      boolean not null default false,
  reached_at   timestamptz,
  -- per-checkpoint color override (hex/swatch); null = inherit the flow's color.
  color        text,
  -- marker shape enum; shape (not color) differentiates types. Mirror the union
  -- in lib/types.ts (CheckpointShape) and the Zod enum in lib/tasks/schemas.ts.
  shape        text not null default 'flag'
               check (shape in ('flag', 'diamond', 'star', 'dot', 'triangle')),
  -- tiebreak ordering for two checkpoints that share a date.
  position     double precision not null default 0,
  created_by   uuid references members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index task_checkpoints_task_idx on task_checkpoints(task_id);
create index task_checkpoints_workspace_idx on task_checkpoints(workspace_id);

create trigger task_checkpoints_set_updated_at
  before update on task_checkpoints
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security. A checkpoint is visible/editable exactly when its task is:
-- the nested tasks query is itself RLS-filtered, so a private task's checkpoints
-- stay hidden from the partner without re-deriving scope/visibility here. Reuses
-- the existing private.current_workspace_id() helper. Clients write directly
-- (no definer trigger), so both select and write policies are granted.
-- ---------------------------------------------------------------------------
alter table task_checkpoints enable row level security;

create policy task_checkpoints_select on task_checkpoints for select
  using (
    workspace_id = private.current_workspace_id()
    and exists (select 1 from public.tasks t where t.id = task_id)
  );
create policy task_checkpoints_write on task_checkpoints for all
  using (
    workspace_id = private.current_workspace_id()
    and exists (select 1 from public.tasks t where t.id = task_id)
  )
  with check (
    workspace_id = private.current_workspace_id()
    and exists (select 1 from public.tasks t where t.id = task_id)
  );

-- ---------------------------------------------------------------------------
-- Realtime + Data API grants
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table task_checkpoints;
grant select, insert, update, delete on table task_checkpoints to authenticated;
