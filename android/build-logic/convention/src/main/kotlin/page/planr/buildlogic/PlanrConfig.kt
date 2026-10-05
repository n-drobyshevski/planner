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

const val DEFAULT_WEB_ORIGIN = "https://planr.page"
