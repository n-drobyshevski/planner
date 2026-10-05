// Pure Kotlin/JVM: the Supabase row shapes + domain enums, shared by every layer
// (including the JVM-only :core:recurrence port).
plugins {
    alias(libs.plugins.planr.jvm.library)
    alias(libs.plugins.kotlin.serialization)
}

dependencies {
    api(libs.kotlinx.serialization.json)
    api(libs.kotlinx.datetime)
}
