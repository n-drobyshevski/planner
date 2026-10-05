// Home-screen widgets (Jetpack Glance): Today agenda, Week, Week grid, Month, Tasks, Quick add.
// They render from the Room cache in :core:data (never the network) and
// re-render when :core:data's WidgetRefreshDispatcher fans out a refresh.
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
    // Glance's per-widget state (refresh tick, optimistic completions).
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.work.runtime.ktx)
}
