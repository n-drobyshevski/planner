// The Quick add sheet (task or event), also hosted by the Quick add widget
// through the translucent QuickAddActivity.
plugins {
    alias(libs.plugins.planr.android.library)
    alias(libs.plugins.planr.android.compose)
    alias(libs.plugins.planr.android.hilt)
}

android {
    namespace = "page.planr.android.feature.quickadd"

    testOptions {
        // Robolectric (the Quick Settings tile's intents) needs the merged manifest.
        unitTests.isIncludeAndroidResources = true
    }
}

dependencies {
    implementation(projects.core.design)
    implementation(projects.core.data)
    implementation(libs.androidx.activity.compose)
    // AppCompatActivity: the member's language below Android 13.
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
}
