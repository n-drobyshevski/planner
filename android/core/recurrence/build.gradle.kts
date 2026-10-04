// Pure Kotlin/JVM port of lib/recurrence/* (expand, edit-semantics, rrule-build).
// No Android dependency, so parity tests against the TypeScript golden fixtures
// (src/test/resources/, exported by scripts/export-recurrence-fixtures.ts) run on
// a plain JVM. RRULE handling is a hand port of rrule.js (src/main/.../rrule/)
// rather than a library, so quirks the web relies on match byte for byte.
plugins {
    alias(libs.plugins.planr.jvm.library)
    alias(libs.plugins.kotlin.serialization)
}

dependencies {
    api(projects.core.model)
}
