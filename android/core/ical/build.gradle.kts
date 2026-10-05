// Pure Kotlin/JVM port of lib/ical/* (the .ics import's parser and review
// rules). Parity is pinned by golden fixtures exported from the real
// TypeScript code (src/test/resources/ics-fixtures.json, `pnpm fixtures:ics`).
plugins {
    alias(libs.plugins.planr.jvm.library)
}

dependencies {
    api(projects.core.model)
    implementation(projects.core.recurrence)
}

tasks.withType<Test>().configureEach {
    // Every zone and locale the port uses is explicit; a hostile JVM default
    // makes any read of the system zone or locale fail a test.
    systemProperty("user.timezone", "Pacific/Chatham")
    systemProperty("user.language", "ru")
    systemProperty("user.country", "RU")
}
