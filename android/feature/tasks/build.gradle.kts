// Tasks list, task detail/edit and completion.
plugins {
    alias(libs.plugins.planr.android.library)
    alias(libs.plugins.planr.android.compose)
    alias(libs.plugins.planr.android.hilt)
}

android {
    namespace = "page.planr.android.feature.tasks"
}

dependencies {
    implementation(projects.core.design)
    implementation(projects.core.data)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)

    testImplementation(libs.kotlinx.coroutines.test)
}
