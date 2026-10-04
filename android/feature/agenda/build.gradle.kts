// Agenda (day/week, both members in their colors) and event detail/edit.
plugins {
    alias(libs.plugins.planr.android.library)
    alias(libs.plugins.planr.android.compose)
    alias(libs.plugins.planr.android.hilt)
}

android {
    namespace = "page.planr.android.feature.agenda"
}

dependencies {
    implementation(projects.core.design)
    implementation(projects.core.data)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
}
