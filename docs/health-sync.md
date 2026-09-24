# Fitbit Air / Google Health sync

Syncs the Fitbit Air (a screenless tracker) via the **Google Health API**
(`https://health.googleapis.com/v4`) — the Fitbit Web API it replaces shut down
in September 2026 and stopped taking new registrations. Sleep (with stages),
HRV, resting heart rate, SpO₂, steps, active zone minutes and exercise are
stored per member in `health_daily`, private under RLS like `sleep_logs`. Sync
also auto-fills `sleep_logs.bedtime_at`/`woke_at` (never quality, fatigue, or
notes — see `lib/health/sync.ts`) and is readable by Anchor through the
`get_health` MCP tool.

## 1. GCP project + OAuth client (one-time, per household)

1. Create (or reuse) a GCP project. Enable the **Google Health API** in the API
   library.
2. **OAuth consent screen**: External user type. Set publishing status to
   **"In Production"** — leaving it in "Testing" means refresh tokens expire
   after 7 days and sync silently stops. An unverified "In Production" client
   still works for up to 100 *test users* without Google's app-review process
   (the `googlehealth.*` scopes below are Restricted, but review is only
   required past 100 users).
3. Under **Test users**, add both members' Google accounts. Each of you will
   click past an "unverified app" warning once, the first time you connect.
4. **Credentials → Create OAuth client ID**, type "Web application".
   - Authorized redirect URI: `https://<your-domain>/api/health/callback`
     (and, for local dev, `http://localhost:3000/api/health/callback`).
5. Copy the client ID/secret into `GOOGLE_HEALTH_CLIENT_ID` /
   `GOOGLE_HEALTH_CLIENT_SECRET` (`.env.example`).

## 2. App configuration

- `HEALTH_TOKEN_KEY` — `openssl rand -base64 32`. AES-256-GCM key for the
  stored refresh token (`lib/health/crypto.ts`); rotating it orphans every
  existing connection (each member reconnects from Settings → Health).
- `CRON_SECRET` — `openssl rand -hex 32`. Set it in Vercel too; Vercel's cron
  caller then sends `Authorization: Bearer $CRON_SECRET` automatically.
- Run the `20260724000000_health_sync.sql` migration (`supabase db reset`
  locally, or however migrations are applied in your environment).

## 3. Scopes requested

```
https://www.googleapis.com/auth/googlehealth.sleep.readonly
https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly
https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
```

All read-only. `access_type=offline&prompt=consent` is set on every auth
request (no `include_granted_scopes`) so a refresh token is issued on every
connect, including a reconnect after a prior grant.

## 4. How syncing runs

- **Cron** (`vercel.json`'s `crons`, `app/api/cron/health-sync/route.ts`):
  once a day at 06:00 UTC. The **Hobby plan allows exactly one cron run per
  day** — this is deliberately a single run, not the two originally floated,
  relying on sync-on-read for freshness the rest of the day.
- **Sync-on-read** (`syncMemberIfStale`, `lib/health/sync.ts`): re-syncs a
  member's data when it's more than 30 minutes stale, called from the
  Insights → Sleep tab and from the `get_sleep_summary`/`get_health` MCP
  tools. It never throws — a sync failure there just means the tool/tab reads
  whatever was already stored.
- **"Sync now"** (Settings → Health): an explicit on-demand sync, ignoring the
  staleness window.
- All three go through a short (60s) per-member Redis lock
  (`lib/health/lock.ts`, reusing the `REDIS_URL`/`KV_URL` mcp-handler already
  needs) so they can't race each other. Sync degrades to running unlocked —
  not to failing — when no Redis URL is configured.

## 5. Connect / disconnect flow

- `app/api/health/connect/route.ts` — redirects to Google with a PKCE
  challenge + anti-CSRF `state`, both stashed in a short-lived httpOnly
  cookie.
- `app/api/health/callback/route.ts` — verifies the session member and
  `state` match the cookie, exchanges the code, encrypts the refresh token,
  and upserts `health_connections`. This route (and the sync job) are the
  only code that ever writes `refresh_token_enc`.
- `app/api/health/disconnect/route.ts` — revokes the token at Google
  (best-effort; disconnecting must still work if Google is unreachable),
  then deletes the connection row and every `health_daily` row. Sleep nights
  already auto-filled stay in `sleep_logs` — that's the member's calendar
  data now, not "Google's".

## 6. Privacy

Each member's connection and synced data are visible only to that member
(RLS; `health_connections`' secret `refresh_token_enc` column isn't even
selectable by the `authenticated` role — only the service role touches it).
Anchor's `get_health` MCP tool returns only the calling member's own rows and
sends them to OpenRouter as part of the assistant's context when
`PLANNER_HEALTH` is enabled there — see `anchor-`'s README for that flag.
