import page.planr.buildlogic.buildConfigString
import page.planr.buildlogic.planrAuthCallbackHost
import page.planr.buildlogic.planrConfigValue
import page.planr.buildlogic.planrGitSha
import page.planr.buildlogic.planrVersionCode
import page.planr.buildlogic.planrVersionName

plugins {
    alias(libs.plugins.planr.android.application)
    alias(libs.plugins.planr.android.compose)
    alias(libs.plugins.planr.android.hilt)
}

// Name from version.properties (semver, bumped by hand); code from the commit
// count, so a later commit's build always installs over an earlier one. See
// build-logic's PlanrVersion.kt.
val appVersionName = planrVersionName()
val appVersionCode = planrVersionCode()

android {
    namespace = "page.planr.android"

    defaultConfig {
        applicationId = "page.planr.android"
        versionCode = appVersionCode
        versionName = appVersionName
        buildConfigField("String", "GIT_SHA", buildConfigString(planrGitSha()))
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

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            // "0.2.0-debug": a test build is never mistaken for a release.
            versionNameSuffix = "-debug"
        }
        release {
            signingConfig = signingConfigs.findByName("release")
            isMinifyEnabled = true
            // Drops resources R8 left unreferenced. Everything Planr loads is
            // referenced statically (R.drawable in code, the manifest's icons,
            // shortcuts.xml, the widgets' info XML and preview layouts), so
            // nothing needs a res/raw/keep.xml.
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    androidResources {
        // en is the default; ru mirrors messages/ru on the web.
        localeFilters += listOf("en", "ru")
    }
}

// APKs are named after the version: planr-0.2.0-143-debug.apk.
base {
    archivesName = "planr-$appVersionName-$appVersionCode"
}

dependencies {
    implementation(projects.core.design)
    implementation(projects.core.data)
    implementation(projects.feature.agenda)
    implementation(projects.feature.tasks)
    implementation(projects.feature.insights)
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
    // Installs src/main/baseline-prof.txt (AOT-compiled startup path) on sideloaded builds too.
    implementation(libs.androidx.profileinstaller)

    testImplementation(libs.kotlinx.coroutines.test)
}
