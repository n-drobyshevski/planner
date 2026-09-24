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
| `lib/mcp/auth.ts` | Token verification + per-tool scoped context |
| `lib/mcp/client.ts` | Member-scoped Supabase client from a bearer token |
| `lib/mcp/env.ts` | Feature flag + Redis/issuer/resource config |

## Tools

Read: `get_workspace`, `list_events`, `list_tasks`, `get_sleep_summary`,
`get_agenda`. Write: `create_event`, `update_event`, `create_task`,
`update_task`, `complete_task`. Destructive (`delete_event`, `delete_task`)
require `confirm: true` — called without it they return a preview of what
would be removed. RLS is the backstop for all of them.

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

The consent screen also shows the client's redirect host, per the MCP auth spec.

## Verifying

- Local protocol check: `npx @modelcontextprotocol/inspector` against
  `http://localhost:3000/api/mcp` (needs `MCP_ENABLED=true` + `REDIS_URL`).
- Cross-member RLS: as member A, confirm `get_sleep_summary` never returns B's
  nights, and that shared events/tasks appear for both.
- Unit tests: `pnpm test test/mcp/tools.test.ts`.

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
