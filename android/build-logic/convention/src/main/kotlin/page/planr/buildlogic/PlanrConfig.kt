package page.planr.buildlogic

import org.gradle.api.Project

/**
 * Reads a runtime config value (e.g. `PLANR_SUPABASE_URL`) from a Gradle
 * property first, then the environment, falling back to [default]. Values are
 * never committed; a build with nothing set still succeeds (empty strings).
 */
fun Project.planrConfigValue(name: String, default: String = ""): String =
    providers.gradleProperty(name)
        .orElse(providers.environmentVariable(name))
        .getOrElse(default)

/** Quotes a value as a Java string literal for `buildConfigField("String", ...)`. */
fun buildConfigString(value: String): String =
    "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

/** The web origin (`PLANR_WEB_ORIGIN`, default https://planr.page). */
fun Project.planrWebOrigin(): String = planrConfigValue("PLANR_WEB_ORIGIN", DEFAULT_WEB_ORIGIN)

/** Host of [planrWebOrigin]; the App Link callback is verified against it. */
fun Project.planrWebHost(): String = java.net.URI(planrWebOrigin()).host

const val DEFAULT_WEB_ORIGIN = "https://planr.page"
