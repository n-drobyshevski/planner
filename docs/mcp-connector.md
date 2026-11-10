# Claude MCP connector

A remote [MCP](https://modelcontextprotocol.io) server that lets Claude
(claude.ai web/mobile, Claude Desktop, Claude Code) read and write the planner's
**calendar, tasks, and sleep** — scoped per member by RLS.

It is mounted **inside this app** (no separate deployment): the MCP endpoint is a
Next.js route handler at `/api/mcp`, OAuth-secured by Supabase's own OAuth 2.1
server. Each member authorizes Claude with their existing planner login; the
issued JWT both authorizes the call and scopes RLS, so shared calendar/tasks are
visible to both members while member-private sleep stays private.

## Architecture

```
claude.ai / Desktop / Code
   │  Streamable HTTP + Authorization: Bearer <member JWT>
   ▼
/api/mcp                         (mcp-handler + withMcpAuth)
   • verifyMcpToken: validate Supabase JWT → resolve member
   • per-request RLS-scoped Supabase client
   • tools delegate to lib/supabase/queries.ts + mutations.ts
   ▼
Supabase (RLS enforced)
```

OAuth discovery: Claude reads `/.well-known/oauth-protected-resource` → it points
at Supabase's auth server → the member approves on `/oauth/consent` (our consent
page) → Supabase issues the token.

## Files

| Path | Role |
| --- | --- |
| `app/api/[transport]/route.ts` | MCP endpoint (basePath `/api` → `/api/mcp`) |
| `app/.well-known/oauth-protected-resource/route.ts` | OAuth resource metadata (RFC 9728) |
| `app/[locale]/oauth/consent/page.tsx` | Consent screen |
| `app/api/oauth/decision/route.ts` | Approve/deny handler |
| `lib/mcp/tools.ts` | Tool definitions (compact, RLS-backed) |
| `lib/mcp/projection.ts` | Pure projections for `get_agenda` |
| `lib/mcp/flows.ts` | Pure projection for `get_flows` (streams and attention) |
| `lib/mcp/auth.ts` | Token verification + per-tool scoped context |
| `lib/mcp/client.ts` | Member-scoped Supabase client from a bearer token |
| `lib/mcp/env.ts` | Feature flag + Redis/issuer/resource config |

## Tools

Read (`list_tasks` takes `tag` and `mine`): `show_flows` (the same streams as `get_flows`, with a view: see [The Flows app](#the-flows-app-mcp-app)), `get_workspace`, `list_events`, `list_tasks`, `get_task` (one task with its editable fields and its subtask tree), `get_sleep_summary`,
`get_agenda`, `get_flows`. Write: `create_event`, `update_event`, `create_task`,
`update_task`, `complete_task`. Destructive (`delete_event`, `delete_task`)
require `confirm: true` — called without it they return a preview of what
would be removed. RLS is the backstop for all of them.

Tags: `list_tasks` returns each task's `tags` (omitted when empty) and takes an
optional `tag` filter; `create_task` and `update_task` accept `tags: string[]`
(normalized server-side; `update_task` with `tags: []` clears them);
`get_workspace` also returns every tag in use (`tags`) and the caller's saved
streams (`streams`, id and name only).

Dependencies (blocks / blocked-by, the `task_dependencies` table): a task can
wait for other tasks. `list_tasks` rows carry `position` (order among
siblings) and `blockedBy` (ids of the tasks it waits for, omitted when none).
`create_task` takes `blockedBy: string[]` (max 20), added once the task exists.
`update_task` takes `blockedBy: string[]` that REPLACES the set (adds what's
missing, removes the rest; `[]` clears) and returns the final `blockedBy`.
Every id must be a task the caller can see; a task can't wait for itself;
only the blocked task's owner can change its blockers; and a loop is refused
with "That would make a dependency loop: …" (checked over the visible edges
first, and by the database's acyclic trigger for chains through tasks the
caller can't see; a refused replace undoes the adds it made). `get_task`
returns `sequential` (its subtasks are "do in order"), `blockedBy` and
`blocks` (each `{ id, title, done }`: what it waits for, and what waits for
it), and each subtask row adds `sequential`, `blocked` (open and waiting on an
unfinished dependency or an earlier sibling under a "do in order" parent),
`start?`, `due?` and `blockedBy?` (ids). Blocking is soft: completing a
blocked task is allowed (the web app says what it was still waiting for).

## Streams and attention

`get_flows` answers "which of my tasks need attention now, stream by stream".
It runs the same pure pipeline as the web app's Streams view, so the numbers
match. Input: `date` (required, the caller's local today, `yyyy-MM-dd`),
`groupBy` (`tag` default, `category`, `collection`, `assignee`, `status`,
`priority`), `stream` (a saved stream's id or name: its filter, grouping and
attention mode apply, and explicit `groupBy`/`attention` override them),
`attention` (`deadline`, `priority`, `combined` default), `mine` (only
top-level tasks you own or are assigned to; default false, which also includes
the partner's shared tasks, never their private ones) and `limit` (1..10 tasks
per stream, default 3). Output: `{ date, groupBy, attention, stream?, streams:
[{ key, label, open, done, overdue, needsAttention, nextDue?, score, tasks:
[{ id, title, start?, dueDate?, progress?, priority?, score, overdue, tags?,
blocked?, waitingOn?, holds? }] }], truncated? }`,
streams most-pressing first; more than 30 streams are cut to the 30 top-ranked
with `truncated: true`. A task with several tags appears in each tag's stream.
`blocked: true` marks a task waiting for an unfinished dependency,
`waitingOn` names those blockers (`{ id, title }`, at most 3, earliest due
first) and `holds` counts the open tasks waiting for it (each omitted when
empty).

Scoring: urgency is 1 when a task is due today or overdue and falls linearly to
0 at 14 days out (0 with no deadline), importance is priority/3, and `combined`
is their mean; a task "needs attention" at a score of 0.5 or more. A stream's
score is its strongest open task's, a subtask counts toward its parent, and
finished tasks score 0 (they only appear in the stream's `done` count).

`create_event`/`create_task` accept an optional `clientRequestId` (≤100
chars): a caller-chosen idempotency key. Re-calling with the same id (same
owner) returns the row already created for it instead of erroring, via a
unique index on `(owner_id, client_request_id)` — safe for a client that
retries after a dropped response.

> The row builders only *set* `client_request_id` when a caller passes one —
> they never write it unconditionally. That's deliberate: it means a normal
> deploy (which writes rows well before any client passes a
> `clientRequestId`) can't be broken by deploying the app before running
> `supabase/migrations/*_client_request_id.sql`. Still, run the migration
> first — don't rely on this as your deploy order.


## The Flows app (MCP App)

`show_flows` is `get_flows` with a view. A host that supports MCP Apps (claude.ai,
Claude Desktop) renders it in the chat, with three views behind one switch:

- **Flows** (the default): each stream's open tasks as *runways*. A runway is
  a bar from the task's start to its deadline, on one time axis shared by every
  stream, with a line at today. The darker fill is the share of subtasks done.
  A late task carries a hatched overrun from its deadline to today and says how
  far over it is; a task with no deadline fades out past today; one that has
  not started is outlined with dashes. Picking a runway shows its task, with a
  button to mark it done.
- **Now**: every task that needs attention, once each, most pressing first,
  with the streams it belongs to and a Done button.
- **Calendar**: the next seven days, each with its events (fetched through
  `list_events`) and the tasks due that day.

The member can regroup the streams, switch the attention rule and show only
their own tasks.

**Editing.** Picking a runway (or "Edit" in Now) opens the task in an editor
under the view: title, start, deadline, priority and tags, with Save, Done (or
Reopen), Delete and Close. Its subtasks are listed beneath, the whole tree
indented by depth: tick one to complete or reopen it, type in its row to rename
it, press × to delete it, and add a new one at the bottom. "New task" opens the
same editor empty. Delete, for a task or a subtask, takes two presses: the
first only arms the button, and for a task with subtasks says how many go with
it. Every change is one call to an ordinary tool (`create_task`, `update_task`,
`complete_task`, `delete_task`), after which the view refetches; a change that
fails says so and leaves the view as it was. Save sends only the fields that
changed. The editor also has a Collection choice (the member's collections, from
`get_workspace`, plus "No collection"). A new task starts in the first
collection and lands in its first open column. Changing the collection of an
existing task is a move: `update_task` with `collectionId` moves the task and
its whole subtask tree, parents first, each into the new collection's first
open column, or its done column if it is finished; the editor says how many
subtasks go along. The move is one update per task, not one transaction: if a
call fails midway the tool reports the error and the tasks already moved stay
moved. A subtask is created in its parent's collection, with its parent's
privacy, and cannot be moved on its own. Any other host sees an ordinary tool with the same JSON text
as `get_flows`.

For the runways, each task in the output also carries `start` (its planned
start, else its first activity, `yyyy-MM-dd`) and, when it has subtasks,
`progress: { done, total }` over its whole subtree. `get_flows` returns them
too. Only `show_flows`' structured content (the view's data, not the model's
text) adds each task's `subtasks`: its whole subtask tree, flattened
pre-order, done ones included, at most 100 per task and never deeper than
`MAX_DEPTH`, each `{ id, title, parentId, depth (1 = direct child), done,
start?, due?, blocked?, waitingOn? }` (`blocked` here also covers a "do in
order" sibling still waiting its turn).

| Path | Role |
| --- | --- |
| `lib/mcp/app/register.ts` | The `show_flows` tool and the `ui://planner/flows.html` resource |
| `lib/mcp/app/flows-view.ts`, `flows-view.css` | The view (browser code, no framework) |
| `lib/mcp/app/view-model.ts` | Its pure helpers: runway geometry, labels, the Now list, the Calendar days |
| `lib/mcp/app/flows-app.generated.ts` | The built view: one self-contained HTML document |
| `scripts/build-mcp-app.mjs` | Builds it (`pnpm build:mcp-app`; also runs before `pnpm build`) |

How it stays inside the member's permissions:

- The view runs in the host's sandboxed iframe. It is one document with its
  script and styles inline, declares no CSP domains and fetches nothing.
- It holds no token and no session. It gets its data as the tool's
  `structuredContent`, and acts by asking the host to call this server's tools
  (`show_flows` to refetch, `list_events` for the Calendar view, `get_task` for the editor, and the task write tools). The host sends
  those with the member's own bearer token, so RLS decides exactly as it does
  for a call the model makes.
- Titles and tag names are set as text, never parsed as markup.

After changing the view, run `pnpm build:mcp-app` and commit the generated
file; `test/mcp/app-register.test.ts` fails if it is stale. If a host keeps
showing an old view, change `FLOWS_APP_URI` (hosts may cache a resource by
its URI).

## Enabling it (one-time setup)

1. **Redis** — add the Upstash/Redis Marketplace integration on Vercel (region
   `fra1`, matching `vercel.json`). It sets `REDIS_URL`. mcp-handler needs it for
   streamable-HTTP session state. Locally: `REDIS_URL=redis://localhost:6379`.
2. **Supabase OAuth Server** — Dashboard → **Authentication → OAuth Server**:
   - Enable the OAuth 2.1 server.
   - Enable **dynamic client registration** (so claude.ai can register). Restrict
     redirect URIs to `https://claude.ai` / `https://claude.com`.
   - Set **Authorization Path** = `/oauth/consent`.
   - Ensure **Authentication → URL Configuration → Site URL** = `https://planr.page`
     (consent URL = Site URL + Authorization Path).
   - Recommended: use **asymmetric JWT signing keys** (RS256/ES256) — required for
     third-party token validation.
3. **Env** — set `MCP_ENABLED=true` (and `REDIS_URL`) for the environments that
   should serve the connector. Off by default.
4. **Connect** — in claude.ai → Settings → Connectors → Add custom connector, use
   `https://planr.page/api/mcp`. Sign in as a member and approve on the consent
   screen. Add a second connector and sign in as the other member for their scope.

> Note: the member must be signed in to planr.page when authorizing. If not, the
> consent page bounces to `/login`; log in, then re-initiate from claude.ai.

## Restricting to Claude only

Supabase's dynamic client registration lets *any* client register — there is no
native "only Claude" toggle, and OAuth-client redirect URIs are separate from the
general Redirect URLs allowlist. So the lock lives in our consent/decision layer:
a **redirect-host allowlist** (`lib/mcp/env.ts:isAllowedClientRedirect`), enforced
authoritatively in `app/api/oauth/decision/route.ts` and mirrored on the consent
screen.

- Default: only `claude.ai` (covers claude.ai web, Desktop, mobile, Cowork — all
  redirect to `https://claude.ai/api/mcp/auth_callback`). Any other client is
  refused at consent even though it can register.
- `MCP_ALLOWED_REDIRECT_HOSTS` — comma-separated host override; `*` disables the
  guard (consent screen only).
- `MCP_ALLOW_LOOPBACK_REDIRECT=true` — also allow `localhost`/`127.0.0.1`
  redirects. **Claude Code** needs this (RFC 8252 loopback), but so does any
  native client, so it's off by default.
- The first-party Android app's exact callback
  (`https://planr.page/app/auth/callback`) is always allowed, independent of the
  host list — see `docs/android.md`.

The consent screen also shows the client's redirect host, per the MCP auth spec.

## Verifying

- Local protocol check: `npx @modelcontextprotocol/inspector` against
  `http://localhost:3000/api/mcp` (needs `MCP_ENABLED=true` + `REDIS_URL`).
- Cross-member RLS: as member A, confirm `get_sleep_summary` never returns B's
  nights, and that shared events/tasks appear for both.
- Unit tests: `pnpm test test/mcp`.

## Machine client: Anchor

Anchor (the Telegram companion) is a hand-written MCP *client*, not a chat
surface — it calls a fixed set of tools from code (`get_agenda`, `list_tasks`,
`get_workspace`, `create_task`, `create_event`, `complete_task`); its LLM never
sees the tools. It authenticates the same way Claude does — an OAuth grant
through Supabase's OAuth server, gated by the same redirect-host allowlist —
so it needs its **exact** Railway host (not a bare `up.railway.app` suffix,
which would allow *any* Railway app) added to `MCP_ALLOWED_REDIRECT_HOSTS`,
e.g.:

```
MCP_ALLOWED_REDIRECT_HOSTS=claude.ai,anchor-bot-production.up.railway.app
```

Anchor requests `partner: "shared"` on `get_agenda` (the user opted the
partner's shared titles into this) and writes with `isPrivate: true` — items
it creates don't show on the partner's calendar by default. Do **not** set
`MCP_ALLOW_LOOPBACK_REDIRECT=true` for it; Anchor's OAuth callback runs on its
own Railway host, not loopback.

To revoke Anchor's access: remove its host from `MCP_ALLOWED_REDIRECT_HOSTS`
(stops new grants) and, on the Supabase Dashboard, revoke its OAuth grant for
that member (ends the existing one — its refresh token stops working).

## Not yet done / deferred

- Live claude.ai end-to-end test (needs the dashboard steps above + deploy).
- Per-member write rate limiting (the existing IP-based limiter is unsuitable —
  claude.ai calls share an origin). Low priority at two users; revisit before any
  wider exposure.
- Recurring-event **occurrence** edits: `update_event`/`delete_event` act on the
  whole series. Single edits to one occurrence are out of scope for v1.
