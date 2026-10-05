import page.planr.buildlogic.buildConfigString
import page.planr.buildlogic.planrConfigValue
import page.planr.buildlogic.planrWebOrigin

// Supabase (PostgREST + Realtime + Auth) repositories and the Room cache that is
// the single source of truth for the UI and widgets.
plugins {
    alias(libs.plugins.planr.android.library)
    alias(libs.plugins.planr.android.hilt)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.room)
}

android {
    namespace = "page.planr.android.core.data"

    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        // Runtime config from -P<name>=... or the environment; never committed.
        // Empty values build fine — the app then shows a "not configured" state.
        buildConfigField("String", "PLANR_SUPABASE_URL", buildConfigString(planrConfigValue("PLANR_SUPABASE_URL")))
        buildConfigField("String", "PLANR_SUPABASE_ANON_KEY", buildConfigString(planrConfigValue("PLANR_SUPABASE_ANON_KEY")))
        buildConfigField("String", "PLANR_OAUTH_CLIENT_ID", buildConfigString(planrConfigValue("PLANR_OAUTH_CLIENT_ID")))
        buildConfigField("String", "PLANR_WEB_ORIGIN", buildConfigString(planrWebOrigin()))
    }

    testOptions {
        // Robolectric (Room DAO tests) needs merged resources/manifest.
        unitTests.isIncludeAndroidResources = true
    }
}

room {
    schemaDirectory("$projectDir/schemas")
}

dependencies {
    api(projects.core.model)
    api(projects.core.recurrence)

    api(platform(libs.supabase.bom))
    api(libs.supabase.auth)
    api(libs.supabase.postgrest)
    api(libs.supabase.realtime)
    implementation(libs.ktor.client.okhttp)

    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.hilt.work)
    ksp(libs.androidx.hilt.compiler)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.ktor.client.mock)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
}
