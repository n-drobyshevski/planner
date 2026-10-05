// Pure Kotlin/JVM port of the web's Insights logic (lib/analytics/*,
// lib/insights/period.ts, filters.ts, ledes.ts and the tab view selectors).
// Parity is pinned by golden fixtures exported from the real TypeScript code
// (src/test/resources/fixtures/, `pnpm fixtures:insights`).
plugins {
    alias(libs.plugins.planr.jvm.library)
    alias(libs.plugins.kotlin.serialization)
}

dependencies {
    api(projects.core.model)
}

tasks.withType<Test>().configureEach {
    // Fixture zones and locales must differ from the JVM default: any read of
    // ZoneId.systemDefault(), TimeZone.currentSystemDefault() or Locale.getDefault()
    // (e.g. String.format("%.1f") → "3,5") then fails a test instead of passing by accident.
    systemProperty("user.timezone", "Pacific/Chatham")
    systemProperty("user.language", "ru")
    systemProperty("user.country", "RU")
}
