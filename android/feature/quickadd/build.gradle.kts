// The Quick add sheet (task or event), also hosted by the Quick add widget.
plugins {
    alias(libs.plugins.planr.android.library)
    alias(libs.plugins.planr.android.compose)
    alias(libs.plugins.planr.android.hilt)
}

android {
    namespace = "page.planr.android.feature.quickadd"
}

dependencies {
    implementation(projects.core.design)
    implementation(projects.core.data)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
}
