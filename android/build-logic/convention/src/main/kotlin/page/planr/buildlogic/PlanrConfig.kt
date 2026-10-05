package page.planr.buildlogic

import org.gradle.api.Project

/**
 * Reads a runtime config value (e.g. `PLANR_SUPABASE_URL`) from a Gradle
 * property first, then the environment, falling back to [default]. Values are
 * never committed; a build with nothing set still succeeds (empty strings).
 * Blank values count as unset — CI passes unset secrets/vars as "".
 */
fun Project.planrConfigValue(name: String, default: String = ""): String =
    listOf(providers.gradleProperty(name), providers.environmentVariable(name))
        .firstNotNullOfOrNull { it.orNull?.takeIf(String::isNotBlank) }
        ?: default

/** Quotes a value as a Java string literal for `buildConfigField("String", ...)`. */
fun buildConfigString(value: String): String =
    "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

/** The web origin (`PLANR_WEB_ORIGIN`, default https://planr.page). */
fun Project.planrWebOrigin(): String = planrConfigValue("PLANR_WEB_ORIGIN", DEFAULT_WEB_ORIGIN)

/**
 * Origin of the OAuth App Link callback (`PLANR_AUTH_CALLBACK_ORIGIN`, default
 * https://auth.planr.page). A different host from [planrWebOrigin] on purpose:
 * Chrome keeps a same-host redirect (consent on planr.page → callback) inside
 * the Custom Tab instead of handing it to the app.
 */
fun Project.planrAuthCallbackOrigin(): String =
    planrConfigValue("PLANR_AUTH_CALLBACK_ORIGIN", DEFAULT_AUTH_CALLBACK_ORIGIN)

/** Host of [planrAuthCallbackOrigin]; the manifest's App Link is verified against it. */
fun Project.planrAuthCallbackHost(): String = java.net.URI(planrAuthCallbackOrigin()).host

const val DEFAULT_WEB_ORIGIN = "https://planr.page"
const val DEFAULT_AUTH_CALLBACK_ORIGIN = "https://auth.planr.page"
