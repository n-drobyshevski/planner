import page.planr.buildlogic.planrWebHost

plugins {
    alias(libs.plugins.planr.android.application)
    alias(libs.plugins.planr.android.compose)
    alias(libs.plugins.planr.android.hilt)
}

android {
    namespace = "page.planr.android"

    defaultConfig {
        applicationId = "page.planr.android"
        versionCode = 1
        versionName = "0.1.0"
        // App Link host for /app/auth/callback (PLANR_WEB_ORIGIN, default planr.page).
        manifestPlaceholders["planrWebHost"] = planrWebHost()
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    androidResources {
        // en is the default; ru mirrors messages/ru on the web.
        localeFilters += listOf("en", "ru")
    }
}

dependencies {
    implementation(projects.core.design)
    implementation(projects.core.data)
    implementation(projects.feature.agenda)
    implementation(projects.feature.tasks)
    implementation(projects.feature.quickadd)
    implementation(projects.widgets)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.androidx.hilt.work)
    ksp(libs.androidx.hilt.compiler)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.browser)
}
