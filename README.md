# Planner

A Google-Calendar–style shared planner for **two people**. Month / week / day views,
create / edit / delete events (single **and** recurring), drag to create / move /
resize, categories + per-layer visibility, light & dark — with **live two-user sync**
and **per-person privacy**. Plus a **Tasks** layer: a List + Kanban board, ordered
subtasks with "do in order" blocking, and one-click / drag scheduling of tasks onto the
calendar.

Built with **Next.js 16** (App Router) · **TypeScript** · **Tailwind v4** · **shadcn/ui** ·
**Supabase** (Postgres + Realtime + RLS) · **TanStack Query** · **zustand** ·
**date-fns** · **rrule**.

## Calendar model

One workspace, exactly two members. An event is either **shared** (both see + edit) or
**personal** to a member; personal events are **private** (owner only) or **shared**
(both see, owner edits). Recurrence is RFC-5545 (`rrule`), expanded **within the visible
window only** and **DST-correct** (a "9:00 daily" event stays 9:00 local across clock
changes). Per-occurrence cancels/edits and `this` / `this-and-following` / `all` semantics
are supported.

## Tasks

A task layer sits on top of the calendar at **`/tasks`**, with a **List** view and a
**Kanban** board (To Do · In Progress · Done, drag to reorder / move). Tasks share the
events' **shared / personal+private** model, so the same RLS privacy applies.

- **Subtasks.** Split a task into an ordered checklist. Toggle **"Do in order"** and each
  subtask is *blocked* (greyed, with a lock badge) until the one before it is done; the
  parent card shows `done/total` progress.
- **Scheduling.** Put a task on the calendar as real event-block(s) — they render, drag,
  and resize like any event. Use **Add to calendar** for a precise dialog (one block,
  **split into N** blocks, or schedule **subtasks back-to-back**), or open the **Tasks
  rail** on the calendar (toolbar toggle) and **drag a task onto a week/day slot**. Each
  block links back to its task via `events.task_id`; its check-circle toggles the task
  done, and deleting the task removes its blocks.

The link is one nullable column (`events.task_id`) plus a `tasks` table (with
`parent_id` for subtasks and a `sequential` flag) — see
`supabase/migrations/20260601000000_tasks.sql`. Ordering, sequential blocking, the task
tree, and block splitting are pure, unit-tested functions in `lib/tasks/`.

## Auth & privacy

Sign-in is a **profile switch** (pick Alex or Sam, optional PIN) — there is no signup
flow. Under the hood each profile maps to a pre-provisioned Supabase auth user, so
**Row-Level Security enforces privacy server-side**: a member's private events are never
sent to the other member, including over realtime. The RLS helper functions live in a
non-exposed `private` schema (see `supabase/migrations`).

> **Caveat:** whoever picks a profile *is* that member — the PIN is a UX speed-bump, not
> strong auth. Private events are protected by RLS (never leave the database for the other
> person), but anyone with app access can choose either profile. To add real auth later,
> populate `members.auth_user_id` from your provider; the schema, RLS, and UI are unchanged.

## Setup

Prereqs: Node 20+, pnpm 8+, a Supabase project.

1. **Install**

   ```bash
   pnpm install
   ```

2. **Configure env** — copy `.env.example` to `.env.local` and fill in your Supabase
   URL, **publishable** key, **secret** key, and the two members' names/emails/passwords.

   > The secret key is server-only (used by the seed). Never expose it to the browser.

3. **Apply the schema.** With the Supabase CLI (Management API — no DB password needed):

   ```bash
   pnpm exec supabase link --project-ref <your-project-ref> --yes
   pnpm exec supabase db query --linked -f supabase/migrations/20260531000000_init.sql
   pnpm exec supabase db query --linked -f supabase/migrations/20260601000000_tasks.sql
   ```

   (Or paste those files into the dashboard SQL editor, in order.)

4. **Seed** the two members + sample data:

   ```bash
   pnpm seed
   ```

5. **Run**

   ```bash
   pnpm dev    # http://localhost:3000
   ```

   Open the app, pick **Alex** or **Sam**, and start planning. Open it as both (two
   browsers) to see live sync.

## Scripts

| Command | What |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest unit suite (recurrence/DST, overlap packing, visibility, task ordering/blocking/scheduling, …) |
| `pnpm e2e` | Playwright end-to-end (auth, privacy, CRUD, realtime, tasks, scheduling) |
| `pnpm seed` | Create members + sample events + tasks |
| `pnpm exec supabase db advisors --linked --type security` | Security advisors |

## Architecture

```
app/                Next.js routes (select-profile, calendar, tasks) + proxy.ts (auth gating)
components/
  app-nav, toolbar-user-menu        shared top-nav (Calendar ⇄ Tasks) + profile/theme
  calendar/         shell, toolbar, time-grid (+ drag + task drop), month-grid, day-column, event-block
  event/            event-dialog, recurrence-editor, recurrence-scope-prompt
  tasks/            tasks-shell, tasks-toolbar, task-board (@dnd-kit), task-list, task-card,
                    task-dialog, subtask-editor, schedule-task-dialog, task-backlog-rail
  sidebar/          calendar-sidebar (layer + category toggles, add category)
  auth/             profile-switcher, pin-gate
lib/
  recurrence/       expand (DST-correct, windowed), rrule-build, edit-semantics   (pure)
  layout/           pack-day (week/day overlap), pack-month (week lane packing)   (pure)
  datetime/         window, grid-math, local, format                             (pure)
  scope/            visibility (canSee / canEdit / layer filtering)              (pure)
  tasks/            ordering, tree, blocking, schedule, colors                    (pure)
  supabase/         client, server, admin, queries, mutations, realtime, mappers
  hooks/            use-workspace, use-window-events, use-event-mutations, use-tasks, use-task-mutations
supabase/migrations init (calendar) + tasks (tasks table, events.task_id, RLS, realtime)
```

The pure `lib/` core is unit-tested; the data layer + UI are exercised by the Playwright
e2e suite (including a two-context realtime/privacy test).

## Not in v1 (seams left)

- **Reminders / notifications.** The data model leaves room (add a `reminders` column or
  table on `events`); delivery would need a scheduled function + web-push/email. Not wired.

## Deploy

- **App:** Vercel — set the same env vars in the project settings.
- **Database:** Supabase Cloud (the project you linked above). Realtime + RLS are already
  configured by the migration.
