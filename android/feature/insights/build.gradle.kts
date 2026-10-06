// Insights (Overview / Trends / Patterns / Tasks): read-only analytics over the Room cache,
// plus the viewer's own Sleep nights (sleep_logs, read on demand) with the rating sheet.
plugins {
    alias(libs.plugins.planr.android.library)
    alias(libs.plugins.planr.android.compose)
    alias(libs.plugins.planr.android.hilt)
}

android {
    namespace = "page.planr.android.feature.insights"
}

dependencies {
    implementation(projects.core.design)
    implementation(projects.core.data)
    implementation(projects.core.insights)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.kotlinx.datetime)

    testImplementation(libs.kotlinx.coroutines.test)
}

tasks.withType<Test>().configureEach {
    // Hostile defaults (see :core:insights): a read of the device zone or locale fails a test.
    systemProperty("user.timezone", "Pacific/Chatham")
    systemProperty("user.language", "ru")
    systemProperty("user.country", "RU")
}
