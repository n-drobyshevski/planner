# Planr for Android

A native Jetpack Compose client for planr.page, with Glance home-screen
widgets. Like the web app, it talks **directly to Supabase**: PostgREST for
data, Realtime for live changes, RLS for access control. There is no
app-specific API. The server-side setup (OAuth client, App Link verification,
recurrence fixtures) is in [`docs/android.md`](../docs/android.md).

v1 covers the agenda (day/week, with a toggle for the partner's events), event detail and editing
(including "this / this and following / all events" on a series), tasks
(list, detail, complete), Quick add, read-only Insights (Overview, Trends,
Patterns, Tasks), .ics import with a review step, and six widgets: Today,
Week, Week grid, Month, Tasks and Quick add.
Sleep, boards/collections, sharing and push are not in v1.

## Build

Requirements:

- **JDK** 17 or newer (21 is used locally and in CI).
- **Android SDK** with `platforms;android-35` and `build-tools;35.0.0`. Point
  Gradle at it with `ANDROID_HOME` or `sdk.dir` in `local.properties` (which is
  gitignored).
- **Gradle** comes from the wrapper (8.14). AGP is 8.13 and Kotlin 2.2.

Toolchain targets: compileSdk and targetSdk 35, minSdk 26, JVM target 17.

From `android/`:

```sh
export ANDROID_HOME=/path/to/android-sdk
./gradlew assembleDebug                 # app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest             # every module's unit tests
./gradlew lint                          # Android lint for every module
./gradlew clean assembleDebug testDebugUnitTest lint   # what CI runs
```

`testDebugUnitTest` also runs the pure-JVM modules (`:core:model`,
`:core:recurrence`, `:core:ical`, `:core:insights`), whose JUnit 5 `test` task is aliased
under that name.
CI runs the same commands (the `android` job in `.github/workflows/ci.yml`)
with no config set.

## Runtime config

Each value is read at build time into `page.planr.android.core.data.BuildConfig`.
It comes from a Gradle property (`-PNAME=…` or `~/.gradle/gradle.properties`)
or, failing that, an environment variable of the same name.

Nothing is committed. A build with nothing set still succeeds, and the app then
shows a "not configured" sign-in screen.

| Name | Meaning | Default |
| --- | --- | --- |
| `PLANR_SUPABASE_URL` | Supabase project URL, `https://<ref>.supabase.co` | empty |
| `PLANR_SUPABASE_ANON_KEY` | Publishable (anon) key, the same as the web's `NEXT_PUBLIC_SUPABASE_ANON_KEY` | empty |
| `PLANR_OAUTH_CLIENT_ID` | The public PKCE OAuth client registered for the app (see `docs/android.md` §1.3) | empty |
| `PLANR_WEB_ORIGIN` | Web origin of the planner (the consent page lives there) | `https://planr.page` |
| `PLANR_AUTH_CALLBACK_ORIGIN` | Origin of the OAuth App Link callback: the redirect URI and the App Link host in the manifest. Must be a different host from `PLANR_WEB_ORIGIN` | `https://auth.planr.page` |

Never put the service-role key into the app.

## Versioning

- **Version name**: `VERSION_NAME` in `android/version.properties`, semver
  (`MAJOR.MINOR.PATCH`). Bump it by hand in the commit that starts a release:
  PATCH for fixes, MINOR for new features, MAJOR for a change that breaks
  something for users (such as dropping an Android version). Debug builds add
  `-debug` (`0.2.0-debug`).
- **Version code**: the commit count up to `HEAD` (`git rev-list --count
  HEAD`), so a build of a later commit always installs over an earlier one.
  Merging keeps it growing; a squash merge onto `main` can make it smaller
  than the branch build you have installed, and Android refuses a downgrade.
  If that happens, uninstall first or set `PLANR_VERSION_CODE`. A shallow
  clone undercounts (the build warns), so CI checks out the full history.
  `PLANR_VERSION_CODE` (Gradle property or environment) overrides it.
- **Where it shows**: the APK file name (`planr-0.2.0-143-debug.apk`), the
  CI artifact name, and the account menu (`Planr 0.2.0-debug · build 143 ·
  5a0fb8f`, the last part being the commit).

## Release APK

There are two users, so releases ship as a signed APK, through GitHub Releases
or Play internal testing.

1. **Create an upload/release key** once, and keep it outside the repo.
   `*.jks` and `*.keystore` are gitignored.

   ```sh
   keytool -genkeypair -v -keystore ~/keys/planr-release.jks -alias planr \
     -keyalg RSA -keysize 4096 -validity 10000
   ```

2. **Pass the signing values** the same way as the runtime config. Use
   `~/.gradle/gradle.properties` or environment variables, never a file in the
   repo.

   | Name | Value |
   | --- | --- |
   | `PLANR_RELEASE_STORE_FILE` | Path to the `.jks` |
   | `PLANR_RELEASE_STORE_PASSWORD` | Keystore password |
   | `PLANR_RELEASE_KEY_ALIAS` | e.g. `planr` |
   | `PLANR_RELEASE_KEY_PASSWORD` | Key password |

   Without `PLANR_RELEASE_STORE_FILE`, `assembleRelease` produces an unsigned
   APK (`app-release-unsigned.apk`). You can sign that later with `apksigner`.

3. **Build** with the production config:

   ```sh
   ./gradlew assembleRelease \
     -PPLANR_SUPABASE_URL=https://<ref>.supabase.co \
     -PPLANR_SUPABASE_ANON_KEY=<publishable key> \
     -PPLANR_OAUTH_CLIENT_ID=<client id>
   # → app/build/outputs/apk/release/app-release.apk
   ```

   Release builds are minified with R8. The keep rules are in
   `app/proguard-rules.pro`.

4. **Register the certificate for App Links.** Take the key's SHA-256 from
   `keytool -list -v -keystore … -alias planr` and add it to
   `ANDROID_CERT_SHA256` on the web deploy, so that
   `/.well-known/assetlinks.json` verifies the sign-in callback. Without this
   step, sign-in returns to the browser fallback page instead of the app. See
   `docs/android.md` §3.

5. Bump `versionCode` and `versionName` in `app/build.gradle.kts` for every
   release you hand out.

## Install

```sh
adb install -r app/build/outputs/apk/debug/app-debug.apk      # or the release APK
adb shell pm verify-app-links --re-verify page.planr.android
adb shell pm get-app-links page.planr.android                 # auth.planr.page: verified
```

To sideload without adb, copy the APK to the phone and open it. Android asks
once to allow installs from that source.

Debug builds are signed with the local debug key. For the App Link to verify
with one, that key's fingerprint (`./gradlew :app:signingReport`) must be in
`ANDROID_CERT_SHA256`. Otherwise sign-in comes back to the browser fallback
page.

### Test APKs from CI

`.github/workflows/android-apk.yml` builds a debug APK on every push or PR
that touches `android/**`, and on demand (Actions → *Android debug APK* →
*Run workflow*). Download `planr-<version>-<code>-<sha>` (for example
`planr-0.2.0-debug-143-5a0fb8f`) from the run's Artifacts.

One-time repository setup (Settings → Secrets and variables → Actions):

- **Variables:** `PLANR_SUPABASE_URL`, `PLANR_SUPABASE_ANON_KEY`,
  `PLANR_OAUTH_CLIENT_ID`, and optionally `PLANR_WEB_ORIGIN`.
- **Secret `ANDROID_DEBUG_KEYSTORE_BASE64`:** a shared debug keystore, so every
  CI build has the same signature. Then `adb install -r` updates in place, and
  one fingerprint in `ANDROID_CERT_SHA256` covers every build.

  ```sh
  keytool -genkeypair -v -keystore planr-debug.keystore -alias androiddebugkey \
    -storepass android -keypass android -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Planr Debug"
  base64 -w0 planr-debug.keystore   # paste as the secret's value
  keytool -list -v -keystore planr-debug.keystore -storepass android | grep SHA256
  ```

  If you use other passwords or another alias, also set
  `ANDROID_DEBUG_KEYSTORE_PASSWORD`, `ANDROID_DEBUG_KEY_ALIAS` and
  `ANDROID_DEBUG_KEY_PASSWORD`. Locally, the same key is used when
  `PLANR_DEBUG_STORE_FILE` (and the matching `PLANR_DEBUG_*` values) are set.

## Architecture

```
:app ──► :feature:agenda ───┐
     ├─► :feature:tasks ────┤
     ├─► :feature:quickadd ─┼─► :core:data ─► :core:recurrence ─► :core:model
     ├─► :feature:inbox ────┤        │                               ▲
     ├─► :feature:insights ─┤        │                               │
     │          └───────────┼────────┼─► :core:insights ─────────────┘
     ├─► :widgets ──────────┘        │
     └─► :core:design ◄──────────────┘ (features and widgets use it too)

:feature:agenda ─► :core:ical ─► :core:recurrence, :core:model (the .ics import)
```

| Module | Package | Role |
| --- | --- | --- |
| `:app` | `page.planr.android` | `PlanrApplication` (Hilt, WorkManager config, data start-up), `MainActivity`, navigation, sign-in |
| `:core:model` | `…core.model` | Pure JVM. Supabase row shapes (snake_case `@SerialName`), enums, `Occurrence`, `PlanrJson` |
| `:core:recurrence` | `…core.recurrence` | Pure JVM. A port of `lib/recurrence/*` (an internal rrule.js port, the expander, edit semantics, RRULE build/parse), checked against TypeScript golden fixtures |
| `:core:ical` | `…core.ical` | Pure JVM. A port of `lib/ical/*` for the .ics import: `IcsParser` (RFC 5545 → event drafts), `IcsZones` (TZID resolution, java.time wall times), `IcsReview` (name / date filters, duplicates, default selection), checked against TypeScript golden fixtures |
| `:core:insights` | `…core.insights` | Pure JVM. A port of the web's Insights logic (`lib/analytics/*`, `lib/insights/*`: periods, filters, analytics, ledes, labels, the tabs' view selectors), checked against TypeScript golden fixtures |
| `:core:design` | `…core.design` | `PlanrTheme` (warm paper, warm-stone accent, member colors, light and dark), tokens from `DESIGN.md`, Glance colors, bundled fonts |
| `:core:data` | `…core.data` | Auth, Supabase client, Room cache, repositories, sync, Hilt bindings, `BuildConfig` |
| `:feature:agenda` | `…feature.agenda` | Day/week agenda, event detail, event editor, recurring-edit scopes, the .ics import review |
| `:feature:tasks` | `…feature.tasks` | Task list with filters, task detail/edit, complete |
| `:feature:quickadd` | `…feature.quickadd` | Quick add bottom sheet, plus the translucent `QuickAddActivity` the widget opens |
| `:feature:insights` | `…feature.insights` | Insights: period bar, filters, the Overview / Trends / Patterns / Tasks tabs with hand-drawn Canvas charts, the day sheet |
| `:feature:inbox` | `…feature.inbox` | Inbox (from the account menu, with its count badge): timeslot requests to approve or decline, recent events and tasks to rate, unlogged nights |
| `:widgets` | `…widgets` | Glance widgets: Today, Week, Week grid, Month, Tasks, Quick add |

Shared build setup is in `build-logic/`, as the convention plugins
`planr.android.application`, `planr.android.library`, `planr.android.compose`,
`planr.android.hilt` and `planr.jvm.library`. Versions are in
`gradle/libs.versions.toml`.

### Sign-in

Sign-in uses OAuth 2.1 authorization code + PKCE against Supabase's OAuth
server, in a Custom Tab:

1. `SessionManager.beginSignIn()` stores the PKCE verifier and `state`
   (encrypted) and returns the authorize URL. The sign-in screen opens it in a
   Custom Tab in Chrome when Chrome is installed, whatever the default browser:
   Firefox by default never hands a link to an app ("Open links in apps" is
   off), which would strand the user on the callback's fallback page.
2. The user signs in on planr.page with a passkey or passphrase, then approves
   on `/oauth/consent`.
3. The App Link `https://auth.planr.page/app/auth/callback?code=…&state=…` opens
   `MainActivity` (singleTask). It's on its own host because Chrome keeps a
   same-host redirect (the consent page is on planr.page) inside the Custom Tab. The intent arrives in `onNewIntent`, or in
   `onCreate` after a cold start, and goes to `SessionManager.handleCallback`.
4. `state` is checked and the code is exchanged at `/auth/v1/oauth/token`. The
   member is then resolved the way `verifyMcpToken` does it:
   `members.auth_user_id = sub`.

Tokens are kept in a Preferences DataStore, encrypted with AES-256-GCM under
an Android Keystore key.

supabase-kt runs without its Auth plugin. Its `accessToken` hook asks
`SessionManager`, which refreshes the token under a mutex within 60 s of
expiry. It also refreshes ahead of time, so Realtime gets the new token before
the old one expires. Expiry is measured on the device clock (`expires_in`), so
a skewed clock can't make it refresh late or on every call. A PostgREST 401
forces one refresh and one retry.

If the server rejects a refresh (`invalid_grant` and similar; a 429 or 5xx
only retries later), the app signs out (`SignOutReason.SessionExpired`) and
clears Room.

**Sign out** is in the account menu on the Calendar, Tasks and Insights headers. It
forgets the tokens, wipes Room and blanks the widgets, then (best effort, not
awaited) ends the session on the server with `POST /auth/v1/logout?scope=local`.
A lost phone can't yet be cut off from the web: there is no "connected apps"
page that revokes the grant.

### Data

- **Reads.** Room is the source of truth for every screen and widget.
  `WorkspaceRepository`, `EventRepository`, `TaskRepository` and
  `OccurrenceRepository` expose Room flows.
- **Recurrence.** `OccurrenceRepository` expands recurring events with
  `:core:recurrence`, the same way the web's `expandEvents` does.
- **Writes.** Writes go to Supabase first, using the web's column payloads.
  Updates carry the `updated_at` concurrency guard; a conflict raises
  `StaleWriteException`, the same failure as the web's `StaleWriteError`. The
  saved row is then written into Room, and the widgets are asked to refresh
  (debounced).
- **No outbox in v1.** A write needs a network connection. On failure it
  throws, and the screen keeps the user's input and shows the error.
- **Write ordering.** Every Room write goes through `CacheGate`. A write whose
  request was still in flight when the session was cleared is dropped. A
  snapshot refresh is refetched if a Realtime change or the user's own write
  landed while it was fetching, so it never reverts that change.
- **Completion.** A task is done when it sits on a done board: the
  `tasks_normalize_completed_at` trigger derives `completed_at` from the board.
  A task with no board to move to (outside any collection, or in one without
  a done column) shows no checkbox, as on the web.

### Partner's events

As on the web, your own events and joint ones (a Shared context) always show.
The partner's personal events show only while the toggle in the agenda header
is on: their initial in their colour, a filled disc while shown and an
outlined one while hidden. The rule is `CalendarVisibility` (the web's
`filterVisible`, without category hiding). The choice is saved on the device
in `ViewPreferences` (DataStore, default on), never on the server, just as the
web keeps its sidebar toggles in the browser. Changing it re-renders the
widgets.

### Sync

- **Realtime, while the app is in the foreground.** `RealtimeSync` holds one
  `postgres_changes` channel per workspace, with the same tables and
  `workspace_id` filter as `lib/supabase/realtime.ts`. Deletes can't be
  filtered (their old record holds only the primary key), so each table also
  has an unfiltered DELETE binding. Changes go into Room.
  Every (re)join refetches the visible window, tasks and reference data, in
  case something was missed while disconnected.
- **Periodic, while signed in.** `SyncScheduler` keeps a 30-minute periodic
  `SyncWorker` (network required), plus one immediate run after a fresh
  sign-in. It cancels both on sign-out. The worker syncs the days the widgets
  can show (today ±7 days and this month's whole weeks, `SyncWindows`),
  tasks and reference data.
- **Start-up.** `PlanrApplication.onCreate` starts both through
  `DataInitializer`.
- **Workers.** WorkManager is configured by `PlanrApplication` with
  `HiltWorkerFactory`, so `SyncWorker` is a `@HiltWorker`. The default
  `WorkManagerInitializer` is removed in the app manifest.
- **Widgets.** Writes, Realtime changes and syncs all end in
  `WidgetRefreshDispatcher`. It fans out to the `WidgetRefresher` set that
  `:widgets` contributes with `@Binds @IntoSet`, so `:core:data` never depends
  on Glance.

### Navigation

`PlanrNavHost` (Navigation Compose, string routes in `PlanrRoutes`):

- **Signed out:** only `signin`. Losing the session from anywhere clears the
  back stack back to it.
- **Signed in:** a bottom bar with **Calendar** (`agenda`), **Tasks**
  (`tasks`) and **Insights** (`insights`), shown only on those roots. The
  agenda is always the root of the back stack, and each tab keeps its own
  stack when you switch.
- **Detail routes:**
  - `event/{ref}`: `ref` is an event id or an occurrence key
    `eventId:epochMs`.
  - `event-edit/{ref}`
  - `event-new?start=…`
  - `ics-import` (the .ics import review)
  - `task/{id}`
  - `settings` (from the account menu)
- **Quick add.** The floating button opens the Quick add sheet: an event on
  Calendar, a task on Tasks. Insights has no floating button. The agenda's top-bar "+" opens the
  full event editor instead.
- **Widget taps.** A widget tap sends `MainActivity` an intent with
  `WidgetLaunch.ACTION_OPEN` and a route. `MainActivity` is exported, so that
  route is untrusted. `LaunchRoute.parse` accepts only `agenda`, `tasks`,
  `event/{ref}`, `task/{id}` and `day/{yyyy-mm-dd}`. Once signed in, the app
  opens the route's tab and pushes the detail on top, so Back returns to the
  tab. A `day/…` route posts the date to `AgendaDayRequests`, which the
  agenda takes (open or created next) and shows in the day view.
- **Files.** An .ics file opened in or shared to the app ends in
  `LaunchRoute.Import` (see below), which pushes `ics-import` over the
  agenda once signed in. Like the editors, it is never popped by a later
  launch (`isEditorRoute`).

### .ics import

Events from an .ics file (a Google, Outlook or Apple Calendar export, an
invitation) are reviewed before anything is written.

- **Opening a file.** `MainActivity` takes a VIEW of a `content:` / `file:`
  URI (by MIME type `text/calendar`, `application/ics`,
  `text/x-vcalendar`, or by a `.ics` name, since many apps send
  `application/octet-stream`) and a SEND of `text/calendar` (a stream, or
  the calendar as text). An `https` VIEW stays the sign-in callback
  (`IncomingIntent.classify`). The account menu's **Import .ics file** opens
  the system picker (`OpenDocument`). Either way the file is read at once on
  IO (`IcsFileReader`, UTF-8, at most 5 MB) into the in-memory
  `IcsImportRequests`, which the review claims once.
- **Parsing.** `:core:ical` ports `lib/ical/*` one to one: line unfolding and
  TEXT escapes, all-day dates as UTC midnights with an exclusive end, TZIDs
  resolved to IANA zones (Windows names and path-style TZIDs too; unknown ones
  read in the viewer's zone, with a warning), wall times resolved like
  `ZonedDateTime.ofLocal` (earlier offset in an overlap, forward through a
  gap), DURATION and missing ends, bare RRULEs with UNTIL in UTC (sub-daily or
  invalid rules, checked with `RRules.isValid`, import once with a warning),
  EXDATEs and RECURRENCE-ID replacements as occurrences to cancel.
- **Review** (`IcsImportScreen` / `IcsImportViewModel`). A name filter
  (substring, `*` / `?` glob, or `/regex/`, all case-insensitive), a From / To
  day range (From defaults to today), select all / none over the rows the
  filters keep, and one context and sharing choice for every event (a shared
  context makes them joint, as in the editor). Each row shows its title,
  times in the viewer's zone, the repeat summary and badges (Already in
  Planr, Cancelled, Repeats not supported, Unknown time zone, Extra dates
  ignored, Edited); tapping it opens an inline editor (title, all-day,
  start / end, zone) built from the editor's own `WhenSection`. Duplicates,
  cancelled and past events start unticked.
- **Duplicates.** Before the review, `EventRepository.findImportCandidates`
  asks the server for the member's events whose `attributes.icalUid` is one
  of the file's UIDs (quoted IN lists of 100) and for their events in the
  file's span (the paged `fetchWindow`, without overrides). An event is
  already in Planr with the same UID, or the same title, start and end.
- **Import.** `EventRepository.createEvents` inserts the drafts 200 per
  statement (all or nothing: earlier chunks are deleted if one fails), then
  one Room upsert and one widget refresh; the UID is kept as
  `attributes.icalUid`. EXDATEs follow as one bulk insert of cancel
  overrides (`cancelOccurrences`); if that fails, the created events are
  deleted again. The agenda then shows "Imported N events" with an Undo that
  deletes them all (`deleteEvents`).

### Settings

**Settings** in the account menu holds what the member sets for the app,
in self-contained sections (`SettingsScreen`):

- **Time zone.** The primary zone (null follows the device) and the
  secondary zone on `members`, picked from a searchable list with the
  device zone first.
- **Notifications.** `members.show_success_toasts`. Off mutes plain
  confirmations; failures and notices with Undo always show.
- **Sleep.** "Update calendar from check-ins", the sleep category and the
  night window on `member_sleep_prefs`, upserted on `member_id` with only
  the edited columns.

Every control applies at once and is shown ahead of its write; a failed
write puts it back with one error line. Member writes go through
`WorkspaceRepository.updateMemberPreferences`, which caches the stored row,
so the agenda's zone and the notices follow at once.

### Insights

The web's Insights surface for the phone layout: Overview, Trends, Patterns
and Tasks (no Sleep, suggestions, goals, forecast or saved views). Every
number comes from what the app already caches: events, overrides, categories,
members and tasks.

- **Logic.** `:core:insights` ports the TypeScript functions one to one:
  epoch-ms `Long`s and half-open windows, days and DST through `java.time` in
  the viewer's zone (`viewerTimeZone(member)`, never the device zone), JS
  `Math.round` / `toFixed` semantics, `Locale.ROOT` decimals and the
  date-fns name tables rather than CLDR's. `:feature:insights` only builds
  the active tab's model, debounced, on `Dispatchers.Default`.
- **Data windows.** A period resolves to a current and a previous window.
  `InsightsViewModel` fetches their union (`[prev.start, cur.end)`, up to 732
  days) once per period change, and reads each window from Room separately
  with `OccurrenceRepository.observeUntracked`, so Insights never moves the
  agenda's `VisibleWindowTracker`. On resume it refreshes only the current
  window (at most every 30 s); pull-to-refresh fetches the union and the
  reference data. `fetchWindow` and `fetchTasks` page past the server's
  `max_rows` (keyset paging terminated by an exact count), so large
  workspaces are complete. The web still truncates there, so for more than
  1000 events or tasks its numbers can differ.
- **Scope and filters.** Like the web: the viewer's own and joint items, the
  tasks they own or are assigned. The agenda's partner toggle does not apply.
  Hidden categories and "include inactive" are kept per viewer on the device
  (`InsightsPreferences`, DataStore). The period, granularity and tab live in
  the ViewModel's saved state, so "Open in calendar" and back keeps them.
- **Fixtures.** `pnpm fixtures:insights` runs the real TypeScript functions
  and writes one JSON file per area into
  `core/insights/src/test/resources/fixtures/`; the Kotlin tests replay every
  case. The exporter pins `TZ=UTC` before loading anything and checks that
  the output is the same under Pacific/Chatham and America/Santiago;
  `test/insights-fixtures.test.ts` checks for drift in `pnpm test`. The
  strings in `feature/insights/src/main/res/values{,-ru}/strings_insights_*.xml`
  are tied to `messages/*.json` by the manifests in
  `feature/insights/src/test/resources/strings-source/` (hashes checked by
  vitest, format args and plurals by `StringsManifestTest`).
- **Hostile test defaults.** The unit tests of `:core:insights` and
  `:feature:insights` run with the JVM default zone Pacific/Chatham and the
  locale ru-RU, so any read of the device zone or locale (`ZoneId.systemDefault()`,
  `String.format("%.1f")`) fails a test instead of passing in a UTC/en CI.

### Widgets (Glance)

- **Today.** Today's occurrences from Room, in the members' colors. A tap
  opens the occurrence.
- **Which events.** Today, Week and Month follow the agenda's partner toggle
  (`ViewPreferences`): your own events and joint ones always, the partner's
  personal events only while it is on.
- **Week.** This Monday-to-Sunday week. Past days fold to their heading with
  a count; today and the days ahead list their events as Today does. A day
  heading opens that day in the agenda, an event opens the event.
- **Month.** A wall-calendar month: ISO week numbers down the side, hairline
  grid lines, and each day's events as titled chips in their agenda colours
  (as many as the widget's height fits, then "+N"). Today is circled. ‹ › page
  months per widget (another month is fetched on demand, since sync keeps only
  the current one), + opens Quick add for an event, and a day opens it in the
  agenda.
- **Week grid.** The Month widget's look for one week: seven day columns
  (weekday and date over a stack of event chips, "+N" when they don't fit),
  the range and ISO week in the header, ‹ › paging weeks per widget (fetched
  on demand outside the synced days) and + for a new event. It sits beside the
  list-style Week widget, which keeps start times.
- **Tasks.** Open tasks the viewer is responsible for, or that are in a shared
  context. The checkbox completes the task through `TaskRepository.setDone`
  (owner only, as RLS requires).
- **Quick add.** "+ Task" and "+ Event" open `QuickAddActivity`.

Widgets refresh after any write, on Realtime changes and on each periodic
sync. They read Room only, so Week and Month show what sync has fetched.
They also refresh at local midnight (a non-waking alarm) and on time,
time-zone or locale changes.

## Tests

- **`:core:recurrence`**: golden fixtures produced by the real TypeScript
  functions (`pnpm fixtures:recurrence`, drift-checked by `pnpm test`), plus
  focused tests.
- **`:core:ical`**: golden fixtures produced by the real TypeScript
  functions (`pnpm fixtures:ics`, drift-checked by `pnpm test`): every sample
  file in `test/fixtures/ics` parsed under its viewer zones, plus the name,
  range, duplicate and default-selection cases; focused tests for DST, zones
  and rules, under a hostile default zone and locale.
- **`:core:insights`**: golden fixtures produced by the real TypeScript
  functions (`pnpm fixtures:insights`, drift-checked by `pnpm test`), plus
  focused tests, under a hostile default zone and locale (see Insights).
- **`:core:data`**: payload and query shapes against a fake `PostgrestGateway`,
  paging, session and refresh logic, and Room DAOs (Robolectric).
- **Features and widgets**: ViewModels against in-memory fakes of each
  feature's data-source interface, and the widgets' models. Insights also
  tests its tab-model builders, lede-to-string mapping, chart geometry and a
  loose compute budget (a year of data in under 3 s).
- **`:app`**: widget launch-route parsing, intent routing (sign-in callback,
  .ics files and shares), the .ics byte reader, and the bottom-bar tabs.

There are no instrumented (device) tests yet. Check UI, widgets and sign-in on
a device or emulator.
