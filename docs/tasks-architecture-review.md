# Tasks feature — architecture review & improvement pass (June 2026)

A review of the tasks side of the app (board/list, subtasks, boards, calendar
scheduling) across the data layer, UI layer, and quality infrastructure. Every
finding below was addressed in the same branch; the **Resolution** lines say
how, so this doc doubles as a map of where those mechanisms now live.

## A. Data integrity & enforcement

1. **Invariants were client-only.** Sequential-subtask blocking lived solely in
   `lib/tasks/blocking.ts`; nothing stopped a second client from completing a
   blocked subtask. The `status ↔ completed_at` coupling was maintained by hand
   in the mutations hook; `priority` had no bounds; `tasks(assignee_id)` had no
   index.
   **Resolution:** `supabase/migrations/20260612000000_task_integrity.sql` —
   CHECK constraints, a `before insert or update` trigger normalizing
   `completed_at`, a `before update of status` trigger rejecting out-of-order
   sequential completions (UPDATE-only so undo's bulk restore keeps working),
   and the missing index.

2. **No runtime validation.** `TaskInput` was a bare TS interface; mutations
   wrote whatever the caller sent. zod was installed but unused.
   **Resolution:** `lib/tasks/schemas.ts` — input/patch schemas parsed inside
   `createTask`/`updateTask`/`createBoard`/`updateBoard`. Failures throw a
   plain `Error` with the first issue message so the toast plumbing stays
   readable. `restoreDeleted` stays unvalidated by design (verbatim snapshot
   re-insert).

3. **Due dates had no timezone semantics.** `due_at timestamptz` baked the
   creator's zone into an instant; viewers in other zones could see the date
   shift a day.
   **Resolution:** `20260613000000_task_due_date.sql` converts to a `due_date
   date` column — a zone-free "yyyy-MM-dd" token, the same for every viewer
   (mirrors the floating all-day event pattern). "Overdue" is judged against
   the viewer's zone at render (`isDateTokenPast`, `formatDayMonthToken` in
   `lib/datetime/`).

## B. Query/cache behavior

4. **Every change refetched the whole task set.** One flat
   `["tasks", workspaceId]` query, and both mutations and realtime events
   invalidated it wholesale. The flat key itself is right (the calendar
   backlog rail, per-board counts, and subtask lookups all need cross-board
   data, and `board_id` is nullable) — the cost was refetch *frequency*.
   **Resolution:** `lib/tasks/cache.ts` applies realtime payload rows and
   mutation results directly to the cache (upsert/remove, stale echoes skipped
   by `updated_at`). Undo paths still refetch once — the simplest correct
   reconcile after a bulk restore.

5. **Realtime failures were silent.** A dead channel just meant stale data.
   **Resolution:** `subscribeWorkspace` (lib/supabase/realtime.ts) now surfaces
   channel status; on reconnect the task/event queries refetch once to recover
   missed payloads.
   *Known gap (unchanged from before):* flipping a task to private delivers no
   payload to the partner under RLS, so their stale row lingers until the next
   refocus/reconnect refetch.

## C. UI architecture, forms, a11y

6. **Hand-rolled, duplicated form state.** `task-dialog.tsx` managed 8 fields
   via useState with title-only validation; the schedule dialog seeded its
   fields in an effect (visible empty-then-filled flash).
   **Resolution:** TaskDialog uses react-hook-form + zodResolver on
   `taskFormSchema` (shared message source with the write schemas), with
   inline `aria-invalid`/`aria-describedby` errors. ScheduleTaskDialog seeds
   via lazy initializers. BoardDialog stays hand-rolled on purpose — it is
   persistently mounted and needs its reset-on-open effect; its writes are
   validated server-side by `boardInputSchema` anyway.

7. **Oversized components & prop drilling.** `tasks-shell.tsx` held 8 useStates
   and drilled 10+ handlers; `task-board.tsx` mixed drag logic, column
   rendering, and mobile swipe; the "resync unless dragging" state pattern was
   duplicated (and reset pending drags on unrelated re-renders).
   **Resolution:** overlay state → `useTaskDialogs` reducer; handlers → one
   `TaskActions` object (`components/tasks/task-actions.ts`); drag state →
   `useBoardDnd`; columns → `board-column.tsx`; the shared pattern →
   `useOptimisticOrder` (value-compared, drag-hold aware, unit-tested).

8. **A11y gaps.** Columns lacked accessible region labels; lists lacked list
   semantics; form errors weren't associated with fields.
   **Resolution:** labelled `section`/`role="list"`/`listitem` structure in
   both views, error association in the dialog.
   *Deliberate:* list-view reordering stays board-only (see note atop
   `task-list.tsx`).

## D. Tests & CI

9. **Boards, drag-and-drop, undo, and realtime had zero e2e coverage; no CI.**
   **Resolution:** `e2e/boards.spec.ts` (board CRUD/filtering/non-empty delete
   guard, kanban cross-column drag with persistence-after-reload, toast Undo),
   a two-context realtime test in `e2e/tasks.spec.ts`, new unit suites for the
   schemas/cache/order hook, and `.github/workflows/ci.yml` (typecheck + lint +
   unit tests per PR; Playwright on dispatch/nightly against a dedicated
   hosted Supabase project — see the workflow header for the secrets it needs).

## Deferred / follow-ups

- Apply the two new migrations with `pnpm supabase db push` when this branch
  ships (the due-date migration drops `due_at`, so it must deploy together
  with this code).
- A hermetic e2e setup (`supabase init` + local stack in CI) would replace the
  shared-project e2e job; recommended end state.
- Per-board query keys were considered and rejected — revisit only if task
  volume makes the full-set fetch itself (not the refetch rate) the problem.
