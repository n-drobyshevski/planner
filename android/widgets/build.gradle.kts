// Home-screen widgets (Jetpack Glance): Today agenda, Tasks, Quick add.
// They read the Room cache from :core:data and refresh on a WorkManager schedule.
plugins {
    alias(libs.plugins.planr.android.library)
    alias(libs.plugins.planr.android.compose)
    alias(libs.plugins.planr.android.hilt)
}

android {
    namespace = "page.planr.android.widgets"
}

dependencies {
    implementation(projects.core.design)
    implementation(projects.core.data)
    implementation(projects.feature.quickadd)
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.androidx.glance.material3)
    implementation(libs.androidx.work.runtime.ktx)
}
