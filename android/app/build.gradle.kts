import page.planr.buildlogic.planrConfigValue
import page.planr.buildlogic.planrAuthCallbackHost

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
        // App Link host for /app/auth/callback (PLANR_AUTH_CALLBACK_ORIGIN,
        // default auth.planr.page).
        manifestPlaceholders["planrAuthCallbackHost"] = planrAuthCallbackHost()
    }

    // Release signing from -P<name>=… or the environment (see README); the
    // keystore itself never lives in the repo. Unset → an unsigned release APK.
    val releaseStoreFile = planrConfigValue("PLANR_RELEASE_STORE_FILE")
    if (releaseStoreFile.isNotEmpty()) {
        signingConfigs.create("release") {
            storeFile = file(releaseStoreFile)
            storePassword = planrConfigValue("PLANR_RELEASE_STORE_PASSWORD")
            keyAlias = planrConfigValue("PLANR_RELEASE_KEY_ALIAS")
            keyPassword = planrConfigValue("PLANR_RELEASE_KEY_PASSWORD")
        }
    }

    // Optional shared debug key (CI's test APKs). A stable key keeps the
    // fingerprint in ANDROID_CERT_SHA256 valid and lets `adb install -r`
    // update across builds. Unset → the machine's own debug key.
    val debugStoreFile = planrConfigValue("PLANR_DEBUG_STORE_FILE")
    if (debugStoreFile.isNotEmpty()) {
        signingConfigs.getByName("debug") {
            storeFile = file(debugStoreFile)
            storePassword = planrConfigValue("PLANR_DEBUG_STORE_PASSWORD", "android")
            keyAlias = planrConfigValue("PLANR_DEBUG_KEY_ALIAS", "androiddebugkey")
            keyPassword = planrConfigValue("PLANR_DEBUG_KEY_PASSWORD", "android")
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("release")
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
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.androidx.hilt.work)
    ksp(libs.androidx.hilt.compiler)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.browser)
}
