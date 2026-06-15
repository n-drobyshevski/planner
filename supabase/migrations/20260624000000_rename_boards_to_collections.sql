-- Planner — rename "boards" → "collections".
--
-- The grouping entity we shipped as a "board" is conceptually a *collection* of
-- tasks: a named, colored, shared-or-personal bucket you can view as a Board
-- (the To Do / In Progress / Done kanban), a List, or Flows. "Board" now means
-- only the kanban view. This renames the table, the `tasks` FK column, and their
-- indexes/policies to match. Forward-only, data-preserving.
--
-- Postgres RENAME keeps data, the FK, RLS policies, grants, and the realtime
-- publication membership (all tracked by OID); only the names change.

alter table boards rename to collections;
alter table tasks rename column board_id to collection_id;

alter index boards_workspace_idx rename to collections_workspace_idx;
alter index tasks_board_idx       rename to tasks_collection_idx;

alter policy boards_select on collections rename to collections_select;
alter policy boards_write  on collections rename to collections_write;
