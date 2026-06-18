# Planner Roadmap

Planner is a calm, utilitarian shared calendar for two. Everything below holds to
that: the tool disappears, color means something, privacy is legible, AAA contrast,
no color-only signals, no gamification. Two ideas recur and are built once, reused
often — a unified **Inbox** and a **4-level scale** standard.

## Sequence at a glance

| Phase | Theme | Size | Depends on |
|------|-------|------|-----------|
| 0 | Loading color-splash bug (quick win) | S | — |
| 1 | 4-level scale standard + data migration | M | — |
| 2 | Optimization + Inbox bundle | L | Phase 1 |
| 3 | Tasks & subtasks overhaul | L | — |
| 4 | Public calendar sharing (full) | XL | Phase 2 (Inbox) |

Phases 3 and 4 are independent and can be swapped; Phase 4's request-approval flow
reuses the Inbox from Phase 2, and Phase 4 is security-heavy, so it sits last.

---

## Phase 0 — Fix the loading color-splash (quick win)

**Goal.** Kill the flash of color on initial load / early navigation.

**What we need.** Reproduce first (record a throttled cold load; note light vs dark
and whether it's the accent color). Leading hypotheses, in order:
1. **Appearance cookie missing/expired** → the blocking init script falls back to
   static defaults (peach accent / warm tone) for one frame, then corrects.
   `lib/theme/appearance-cookie.ts` (`APPEARANCE_INIT_SCRIPT`), `app/[locale]/layout.tsx:93`.
2. **Crossfade opacity 0→1** colliding with CSS settling on the first navigation.
   `components/crossfade.tsx:36–45`, `app/[locale]/providers.tsx` (navigation watcher).
3. **View-transition fade** (300ms) firing around load. `app/globals.css:720–732`.

**Fix direction.** Make the pre-paint default tint neutral/identity-safe until the
real appearance is known (so a missing cookie can't splash a wrong accent), and/or
ensure the cookie is always written. Confirm the crossfade stays gated off for the
first paint (it is, by design — verify it isn't regressing).

**Design intent.** "Users load straight into a task; they don't want to watch it
appear." Zero motion/color on first paint is the correct behavior.

---

## Phase 1 — 4-level scale standard (foundation)

**Goal.** One consistent 4-level scale across every poll. Even-numbered = no neutral
midpoint, so each answer is a real lean and faster to give.

**Scales today → target.**
- Satisfaction 1–5 → **1–4**
- Sleep quality 1–5 → **1–4**
- Fatigue: Karolinska 1–9 → **1–4** (4 named bands; we drop the clinical instrument
  in favor of consistency — fine for a personal 2-person app)
- Energy 1–3 → **1–4** (planning attribute; affects load math)

**What we need.**
- **Single source of truth** for event/task attributes: `lib/attributes/schema.ts`
  (`ATTRIBUTE_KEYS`, `KnownAttributes`, `valueSchemas`, `ATTRIBUTE_META`). Energy and
  satisfaction change here only — the forms render from `ATTRIBUTE_META`.
- **Sleep scales** live separately: `supabase/migrations/.../sleep_logs.sql` CHECK
  constraints, `lib/types.ts` `SleepLog`, `components/insights/sleep/log-fields.tsx`
  (the KSS bands UI). New 4-band fatigue + 4-level quality here.
- **Data migration** mapping old values → 1–4 (1–5 and 1–9 and 1–3 each get a mapping
  table). Apply to prod DB **before** pushing (Vercel auto-deploys `main`).
- **Recalibrate thresholds** that assume the old ranges: `SATISFACTION_LOW_MEAN` (2.5)
  in `lib/insights/suggestions.ts`; `QUALITY_EFFECT` / `FATIGUE_EFFECT` in
  `lib/sleep/adaptive.ts`; energy weighting in `lib/analytics/correlations.ts`
  (`energyLoadPerDay` multiplies duration × energy).

**Design intent.** 4 clear labels per scale, each with a non-color signal (number +
word), legible at a glance. Labels must read plainly: e.g. satisfaction
Poor / Okay / Good / Great; energy Low / Steady / High / Peak (final wording in a
`clarify` pass).

**Risk.** Mixed-scale historical data during the migration window; the mapping
avoids it. Energy → 4 ripples into load/correlation math — re-test those charts.

---

## Phase 2 — Optimization + Inbox bundle

### 2a. Unified Inbox (the keystone)
**Goal.** One place for "things needing your attention." Two item kinds now;
extensible for Phase 4.

**What we need.**
- **Assessment nudges (derived, no table needed):** scan recently-finished events
  lacking a satisfaction rating, done tasks lacking a rating, and mornings missing a
  sleep log. Each nudge is a quick-action row that opens the 4-level poll **inline**
  and writes via the existing satisfaction / sleep-log paths.
- **A nav surface + quiet count badge** (calm, not a red alarm dot). New route
  (e.g. `/inbox`) alongside Calendar / Tasks / Insights, or a slide-over — decide in
  a `shape` pass. Reuse `app/[locale]/(surfaces)` chrome.
- Reuse: `lib/analytics/task-stats.ts`, the satisfaction attribute write path, the
  sleep-log write path.

**Design intent.** Closes the loop that makes the optimization guides smarter:
nudges → ratings → better suggestions. Quiet, dismissible, never nagging.

### 2b. Clearer optimization guides (UI/UX)
**Goal.** Make the Optimize tab read as plain guidance, not a card dump.

**What we need.** The engine is already rich (`lib/insights/suggestions.ts`, 12
suggestion kinds capped at 8; `components/insights/optimize-tab.tsx`). Improve the
*presentation*: a clear two-tier layout (actionable "attention" vs reflective
"info"), one plain-language *why* per item grounded in the numbers, and one explicit
action. Move away from identical cards (an anti-reference) toward a calm prioritized
list. Clarify the coverage nudge copy.

### 2c. Rest-need analysis
**Goal.** On dense/overloaded days, surface where rest can actually fit.

**What we need.** New analysis that, for high-load days (reuse overloaded-day
detection in `suggestions.ts` and density in `lib/analytics/usage.ts`), finds the
largest open gaps in waking hours (excluding the sleep window) — "9h tracked, no
break > 20 min; open 90-min window at 15:00." Surface as a new suggestion kind
(e.g. `rest-window`) and/or a Patterns panel. Factual and calm, with a non-color
signal.

---

## Phase 3 — Tasks & subtasks overhaul

**Goal.** Turn the two-level subtask model into one that handles real, complex work.

**What we need (all four, largest first).**
- **Deeper nesting.** Lift the two-level cap in `lib/tasks/nesting.ts` (`canNest`
  currently rejects a non-top-level parent and a child that has children). Allow
  N levels with **cycle prevention + a max-depth guard**. `tasks.parent_id` is
  already self-referential; generalize the sequential-completion trigger
  (`tasks_check_sequential_done`) to nested trees. UI: recursive tree with
  expand/collapse (today's `subtask-editor.tsx` shows a flat list, no collapse).
- **Per-subtask details.** Subtasks are already `tasks` rows, so the columns exist;
  remove the inherited-only lock (assignee/category/privacy) and expose per-subtask
  due date, assignee, category, priority, notes.
- **Schedule / convert.** Schedule a single subtask onto the calendar (reuse the
  existing task→event block scheduling) and make promote/demote/move fluid (promote
  exists via `mutations.promote()`).
- **Dependencies / linking.** New blocks/blocked-by relation beyond single-parent
  order: a `task_dependencies` table + RLS + cycle prevention + UI, integrated with
  sequential logic.

**Key files.** `lib/tasks/nesting.ts`, `components/tasks/subtask-editor.tsx`,
`components/tasks/task-dialog.tsx`, `supabase/migrations/...tasks.sql` &
`...task_integrity.sql` (sequential trigger), `lib/types.ts` (`TaskRow`).

**Design intent.** A task becomes a small project without becoming cluttered
(anti-reference: prosumer overload). Progressive disclosure — the dialog already
hides "More options" / "Optimization details"; nesting needs clear indentation,
collapse, and non-color status. **Run an `/impeccable shape` pass on the task dialog
before building** — this is a real redesign, not an additive tweak.

---

## Phase 4 — Public calendar sharing (full)

**Goal.** Show your calendar outside the household — by link, with control over who
sees what, a local present mode, and a request-to-book flow.

**What we need.**
- **Share-by-link.** `public_calendar_shares` table (token, owner, visibility config,
  expiry, revoked). Unauthenticated route `app/share/[token]` **outside** the auth
  middleware. New `fetchWindowPublic(token, window)` that validates the token
  server-side and returns only permitted events. Reuse `CalendarCanvas` read-only.
- **Visibility tiers.** Extend today's private / visible / shared model
  (`lib/scope/visibility.ts`, RLS in the sharing migrations) with a **public** tier —
  "only to Elise" vs "public view." Likely a per-share category/visibility filter
  plus a per-event "hide from public" flag. Keep the ladder legible (privacy is a
  load-bearing principle).
- **Present mode (Shift+P).** Local toggle that redacts the authed calendar to "what a
  public viewer sees," no logout. Reuses the public visibility filter; pairs with the
  existing **Shift+M** (blur titles). Register it in the keyboard-shortcuts dialog and
  the handler in `components/calendar/calendar-shell.tsx` (guards for input focus
  already exist).
- **Request a timeslot → Inbox.** Public viewer proposes a time → `timeslot_requests`
  row → appears in the **Phase 2 Inbox** → approve creates an event / decline
  dismisses.

**Security (the heavy part — call out explicitly).** Public *read* must never leak
`is_private` events (strict server-side filter; the anon path cannot rely on the
member RLS context). Public *write* (requests) needs rate-limiting and abuse
protection on an unauthenticated insert, token expiry/revocation, and its own RLS so
only the owner sees pending requests. Threat-model this before building.

**Design intent.** A distinct, quiet "public view" chrome that reads as obviously
read-only and clearly not the private app.

---

## Cross-cutting notes
- **Migrations → prod first.** Vercel auto-deploys `main`; apply each schema/data
  migration to the prod DB before pushing (per project ops history).
- **`/impeccable shape` before building** the three UX-heavy surfaces: the Inbox
  (2a), the task dialog (Phase 3), and the public view chrome (Phase 4).
- **AAA + no color-only signals** apply to every new scale, badge, status, and tier.
