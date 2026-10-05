package page.planr.buildlogic

import java.util.Properties
import org.gradle.api.GradleException
import org.gradle.api.Project

/**
 * The app's version name: `VERSION_NAME` in android/version.properties
 * (semver, bumped by hand).
 */
fun Project.planrVersionName(): String {
    val text = providers.fileContents(rootProject.layout.projectDirectory.file("version.properties")).asText.get()
    val name = Properties().apply { load(text.reader()) }.getProperty("VERSION_NAME")?.trim().orEmpty()
    if (!SEMVER.matches(name)) throw GradleException("version.properties: VERSION_NAME must be MAJOR.MINOR.PATCH, got \"$name\"")
    return name
}

/**
 * The version code: `PLANR_VERSION_CODE` when set (a release pipeline may pin
 * it), else the number of commits up to HEAD, which only grows along a
 * branch. Needs the full history: a shallow clone counts only what it has
 * (CI checks out with `fetch-depth: 0`). Without git, 1.
 */
fun Project.planrVersionCode(): Int {
    planrConfigValue("PLANR_VERSION_CODE").toIntOrNull()?.let { return it }
    val count = git("rev-list", "--count", "HEAD")?.toIntOrNull() ?: return 1
    if (git("rev-parse", "--is-shallow-repository") == "true") {
        logger.warn("Planr: shallow clone, so versionCode $count undercounts; fetch full history (git fetch --unshallow) for a real one.")
    }
    return count
}

/** The short commit hash the build is from (`PLANR_GIT_SHA` when set), else "unknown". */
fun Project.planrGitSha(): String =
    planrConfigValue("PLANR_GIT_SHA").ifEmpty { null }
        ?: git("rev-parse", "--short=7", "HEAD")
        ?: "unknown"

/** Runs git in the repository; its trimmed output, or null when git fails or isn't installed. */
private fun Project.git(vararg args: String): String? = try {
    val result = providers.exec {
        commandLine(listOf("git") + args)
        workingDir = rootProject.projectDir
        isIgnoreExitValue = true
    }
    result.standardOutput.asText.get().trim().takeIf { result.result.get().exitValue == 0 && it.isNotEmpty() }
} catch (_: Exception) {
    null
}

private val SEMVER = Regex("""\d+\.\d+\.\d+""")
