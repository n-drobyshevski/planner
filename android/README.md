# Planr for Android

A native Jetpack Compose client for planr.page. Like the web app, it talks
directly to Supabase (PostgREST + Realtime under RLS); there is no app-specific
API.

## Build

```sh
export ANDROID_HOME=/path/to/android-sdk   # or sdk.dir in local.properties
./gradlew assembleDebug testDebugUnitTest
```

JDK 17+ (21 used locally). Gradle 8.14 via the wrapper; AGP 8.13; compileSdk /
targetSdk 35, minSdk 26. `testDebugUnitTest` also runs the pure-JVM modules'
tests (their `test` task is aliased).

## Runtime config

Read at build time from a Gradle property (`-PNAME=…` or
`~/.gradle/gradle.properties`) or the environment, into
`page.planr.android.core.data.BuildConfig`. Nothing is committed; a build with
nothing set succeeds and the app shows a "not configured" sign-in.

| Name | Meaning | Default |
| --- | --- | --- |
| `PLANR_SUPABASE_URL` | Supabase project URL | empty |
| `PLANR_SUPABASE_ANON_KEY` | Publishable (anon) key | empty |
| `PLANR_OAUTH_CLIENT_ID` | Public PKCE OAuth client for the app | empty |
| `PLANR_WEB_ORIGIN` | Web origin (consent page, App Link host) | `https://planr.page` |

## Modules

| Module | Package | Role |
| --- | --- | --- |
| `:app` | `page.planr.android` | Application, MainActivity, navigation, sign-in |
| `:core:model` | `page.planr.android.core.model` | Pure JVM. Supabase row shapes (snake_case `@SerialName`), enums, `Occurrence` |
| `:core:recurrence` | `page.planr.android.core.recurrence` | Pure JVM. Port of `lib/recurrence/*`, checked against TS golden fixtures |
| `:core:design` | `page.planr.android.core.design` | `PlanrTheme`, tokens from DESIGN.md, Glance colors, bundled fonts |
| `:core:data` | `page.planr.android.core.data` | Supabase client, Room cache, repositories, Hilt bindings, BuildConfig |
| `:feature:agenda` | `page.planr.android.feature.agenda` | Day/week agenda, event detail/edit |
| `:feature:tasks` | `page.planr.android.feature.tasks` | Tasks list, detail, complete |
| `:feature:quickadd` | `page.planr.android.feature.quickadd` | Quick add sheet |
| `:widgets` | `page.planr.android.widgets` | Glance widgets: Today, Tasks, Quick add |

Shared build setup lives in `build-logic/` (convention plugins
`planr.android.application`, `planr.android.library`, `planr.android.compose`,
`planr.android.hilt`, `planr.jvm.library`); versions in `gradle/libs.versions.toml`.
