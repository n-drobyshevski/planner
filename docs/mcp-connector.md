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

Read: `get_workspace`, `list_events`, `list_tasks`, `get_sleep_summary`.
Write: `create_event`, `update_event`, `create_task`, `update_task`,
`complete_task`. Destructive (`delete_event`, `delete_task`) require
`confirm: true` — called without it they return a preview of what would be
removed. RLS is the backstop for all of them.

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

## Verifying

- Local protocol check: `npx @modelcontextprotocol/inspector` against
  `http://localhost:3000/api/mcp` (needs `MCP_ENABLED=true` + `REDIS_URL`).
- Cross-member RLS: as member A, confirm `get_sleep_summary` never returns B's
  nights, and that shared events/tasks appear for both.
- Unit tests: `pnpm test test/mcp/tools.test.ts`.

## Not yet done / deferred

- Live claude.ai end-to-end test (needs the dashboard steps above + deploy).
- Per-member write rate limiting (the existing IP-based limiter is unsuitable —
  claude.ai calls share an origin). Low priority at two users; revisit before any
  wider exposure.
- Recurring-event **occurrence** edits: `update_event`/`delete_event` act on the
  whole series. Single edits to one occurrence are out of scope for v1.
