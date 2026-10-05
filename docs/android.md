# Planr for Android

A native Android app (Kotlin, Jetpack Compose, Glance widgets) in `android/`.
Like the web client, it talks **directly to Supabase**: PostgREST for data,
Realtime for live changes, and RLS for access control. There is no app-specific
backend. The only web-side pieces are sign-in plumbing, which this document
covers:

- the OAuth consent flow (shared with the Claude connector),
- the App Link callback and its Digital Asset Links file,
- the recurrence golden fixtures that keep the Kotlin port in step with
  `lib/recurrence`.

## Sign-in flow

```
Planr for Android
   │  Custom Tab → {SUPABASE_URL}/auth/v1/oauth/authorize
   │      ?response_type=code&client_id=…&redirect_uri=https://planr.page/app/auth/callback
   │      &code_challenge=…&code_challenge_method=S256&state=…
   ▼
Supabase OAuth 2.1 server ──► https://planr.page/oauth/consent   (our consent page)
   │                               • signed out → /login (passkey / passphrase), then back
   │                               • "Planr for Android wants to sign in…" → Allow
   ▼
/api/oauth/decision  (re-checks the redirect allowlist, approves via Supabase)
   │  303 → https://planr.page/app/auth/callback?code=…&state=…
   ▼
Android App Link (verified via /.well-known/assetlinks.json) → the app
   │  POST {SUPABASE_URL}/auth/v1/oauth/token  (code + PKCE verifier)
   ▼
access + refresh tokens → supabase-kt (same RLS as the browser session)
```

The member is resolved from the token the same way the MCP server does it
(`lib/mcp/auth.ts`): the `members` row where `auth_user_id = sub`.

## Web-side pieces

| Path | Role |
| --- | --- |
| `lib/mcp/env.ts` | `isAndroidAppRedirect` / `getAndroidAppRedirectUri`: the app's callback is always allowed by the redirect guard |
| `app/[locale]/oauth/consent/page.tsx` | Consent screen. Reads as "Planr for Android" when the redirect is the app's callback |
| `app/api/oauth/decision/route.ts` | Authoritative allowlist check plus approve/deny (unchanged) |
| `app/.well-known/assetlinks.json/route.ts` | Digital Asset Links (`lib/android/asset-links.ts`) |
| `app/app/auth/callback/page.tsx` | Static fallback shown only if the App Link doesn't open the app |
| `scripts/recurrence-fixtures.ts` | Golden fixtures for `android/core/recurrence` (see below) |

### Redirect allowlist

The consent and decision layers only authorize clients whose redirect is
allowlisted (the "Claude only" guard; see `docs/mcp-connector.md`). The Android
callback is allowed **by default and exactly**:

- **Redirect URI:** `<origin>/app/auth/callback`.
- **Origin:** the origin of `NEXT_PUBLIC_SITE_URL`, or `https://planr.page` when that variable is unset or malformed.
- **Matching:** the full origin and path must match. Query strings, fragments, userinfo, other ports and subdomains are all refused. Allowing the callback never opens the rest of the planner's host as a redirect target.
- **Overrides:** `MCP_ALLOWED_REDIRECT_HOSTS` doesn't affect it. That variable only governs third-party hosts.

The consent page identifies the app by this redirect, not by the client's
self-declared name. A rogue client that registers the same redirect gains
nothing: the code is delivered to the Planr app, whose PKCE verifier won't match,
or to the fallback page, which never reads it.

### Callback fallback page

`/app/auth/callback` normally never loads in a browser, because the verified App
Link hands the URL to the app. If the app is missing, out of date, or not yet
verified, the browser shows a short bilingual (en/ru) page that asks the user to
open Planr and sign in again.

- **Static:** the page never reads `searchParams`, so the code isn't exchanged, logged, stored or forwarded.
- **Own root layout:** it lives in `app/app/layout.tsx` (outside `[locale]`), which has no analytics and sets `referrer: no-referrer`.
- **Not proxied:** it's excluded from the `proxy.ts` matcher, so it is never locale-rewritten or bounced to `/login`.

## One-time setup

### 1. Supabase OAuth server

This is the same server the Claude connector uses. If the connector already works,
only the Supabase steps marked *Android* are new.

1. Dashboard → **Authentication → OAuth Server**:
   - Enable the OAuth 2.1 server.
   - Set **Authorization Path** = `/oauth/consent`.
   - Under **Authentication → URL Configuration**, set **Site URL** = `https://planr.page`.
2. **Planr env:** set `MCP_ENABLED=true` in Vercel. The consent page and
   `/api/oauth/decision` are gated on this flag, so the Android sign-in needs it.
   The flag also mounts `/api/mcp`, which needs `REDIS_URL`.
3. ***Android*: register a public client** (PKCE, no secret). Do this once per
   Supabase project. Either:
   - **Dashboard:** Dashboard → **Authentication → OAuth Apps** → *Add client*:
     - Name: `Planr for Android`
     - Type: **Public** (token endpoint auth method `none`)
     - Redirect URI: `https://planr.page/app/auth/callback`
     - Grant types: `authorization_code`, `refresh_token`
   - **Admin API** (service-role key, from a trusted machine only):

     ```sh
     curl -X POST "$SUPABASE_URL/auth/v1/admin/oauth/clients" \
       -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
       -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
       -H "Content-Type: application/json" \
       -d '{
         "client_name": "Planr for Android",
         "redirect_uris": ["https://planr.page/app/auth/callback"],
         "grant_types": ["authorization_code", "refresh_token"],
         "token_endpoint_auth_method": "none"
       }'
     ```

     In code, the same call is `supabase.auth.admin.oauth.createClient(...)`.

   Note the returned **`client_id`**. It is public and goes into the app build as
   `PLANR_OAUTH_CLIENT_ID`.
4. For a staging project or domain, register a second client whose redirect is
   `<staging origin>/app/auth/callback`, and set that deploy's
   `NEXT_PUBLIC_SITE_URL` to the staging origin so the allowlist follows.

### 2. Digital Asset Links

Set these env vars in Vercel (all environments that serve the App Link domain),
then redeploy:

| Var | Value |
| --- | --- |
| `ANDROID_CERT_SHA256` | Comma-separated SHA-256 signing-certificate fingerprints, `AB:CD:…` or bare hex |
| `ANDROID_PACKAGE_NAME` | Optional, defaults to `page.planr.android` |

**Where the fingerprints come from:**
- **Release / upload key:** `keytool -list -v -keystore planr-release.jks -alias planr` → `SHA256:`.
- **Play App Signing (if distributed via Play):** Play Console → *Test and release → App integrity → App signing* → the app-signing key's SHA-256. Include it **and** the upload key.
- **Debug builds (local only):** `./gradlew :app:signingReport` from `android/`. Don't put debug keys on production unless you want debug builds to verify too.

**What gets served:**
- **Unset or invalid values:** the route serves `[]`, a valid but empty statement list, so no app is verified.
- **Configured:** the route serves one statement for the package with these relations:
  - `delegate_permission/common.handle_all_urls` verifies the App Link.
  - `delegate_permission/common.get_login_creds` lets Credential Manager offer planr.page's passkeys and passwords to the app.

**Caching:** the route reads no request data, so under Cache Components it is
prerendered at build time. Changing the variables needs a redeploy.

**Verify:**

```sh
curl -s https://planr.page/.well-known/assetlinks.json
curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://planr.page&relation=delegate_permission/common.handle_all_urls"
# on a device with the app installed:
adb shell pm verify-app-links --re-verify page.planr.android
adb shell pm get-app-links page.planr.android     # planr.page: verified
```

The app's manifest must declare the matching filter. It needs
`android:autoVerify="true"`, scheme `https`, host `planr.page`, and path
`/app/auth/callback`.

### 3. Android build config

The app reads its config into `BuildConfig` from Gradle properties
(`-P…` or `~/.gradle/gradle.properties`) or environment variables of the same
name. Nothing is hardcoded, and the build succeeds with all of them unset, though
sign-in can't work in such a build.

| Name | Value |
| --- | --- |
| `PLANR_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `PLANR_SUPABASE_ANON_KEY` | Publishable (anon) key, the same one as `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `PLANR_OAUTH_CLIENT_ID` | `client_id` from step 1.3 |
| `PLANR_WEB_ORIGIN` | Defaults to `https://planr.page`. Must match the web deploy's origin, because it builds the redirect URI |

Never put the service-role key into the app.

## Recurrence golden fixtures

The Kotlin port of `lib/recurrence/{expand,edit-semantics,rrule-build}.ts` lives
in `android/core/recurrence`. It is tested against JSON produced by running the
**real** TypeScript functions:

```sh
pnpm fixtures:recurrence
# → android/core/recurrence/src/test/resources/recurrence-fixtures.json
```

The JSON schema and conventions are documented at the top of
`scripts/recurrence-fixtures.ts`. In short:

- Inputs are `events` / `event_overrides` rows exactly as PostgREST returns them.
- Outputs use the domain (camelCase) shapes with ISO-8601 UTC instants.

**Drift check:** `test/recurrence-fixtures.test.ts` regenerates the fixtures in
memory during `pnpm test`. A web-side recurrence change therefore fails CI until
you re-export and commit the JSON. The Kotlin tests then show what to port.

**Coverage:**
- Frequencies: DAILY, WEEKLY, MONTHLY, YEARLY, plus BYDAY, BYMONTHDAY, BYMONTH and INTERVAL.
- Series ends: COUNT, UNTIL (compared in floating wall-clock space, a deliberate quirk) and `recurrence_ends_at` pruning.
- All-day events (anchored to UTC midnight) vs timed events.
- DST in both directions for Europe/Berlin, America/New_York and Europe/Moscow (the historical 2011 and 2014 changes), including a non-existent local time.
- Cancel and modify overrides, including moves into and out of the window.
- Half-open window edges and split series.

**Not covered:** a wall time that occurs twice on a fall-back day. The web's
answer there depends on the host machine's time zone, so there is nothing
deterministic to pin.

## CI

`.github/workflows/ci.yml` has an `android` job alongside `checks`. It sets up
JDK 21 and the Android SDK, then runs
`./gradlew assembleDebug testDebugUnitTest lint` in `android/` with no `PLANR_*`
config.
