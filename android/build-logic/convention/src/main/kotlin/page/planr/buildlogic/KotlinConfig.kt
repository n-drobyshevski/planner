package page.planr.buildlogic

import com.android.build.api.dsl.CommonExtension
import org.gradle.api.JavaVersion
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.dependencies
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.dsl.KotlinAndroidProjectExtension
import org.jetbrains.kotlin.gradle.dsl.KotlinCommonCompilerOptions
import org.jetbrains.kotlin.gradle.dsl.KotlinJvmCompilerOptions
import org.jetbrains.kotlin.gradle.dsl.KotlinJvmProjectExtension

private val JAVA_VERSION = JavaVersion.VERSION_17
private val JVM_TARGET = JvmTarget.JVM_17

/** SDK levels, Java level and Kotlin options shared by every Android module. */
internal fun Project.configureKotlinAndroid(android: CommonExtension<*, *, *, *, *, *>) {
    android.apply {
        compileSdk = libs.versionOf("compileSdk").toInt()
        defaultConfig {
            minSdk = libs.versionOf("minSdk").toInt()
        }
        compileOptions {
            sourceCompatibility = JAVA_VERSION
            targetCompatibility = JAVA_VERSION
        }
        testOptions {
            // Plain JVM unit tests may touch android.* stubs (e.g. Log) without crashing.
            unitTests.isReturnDefaultValues = true
        }
    }
    extensions.configure<KotlinAndroidProjectExtension> {
        compilerOptions { applyPlanrDefaults() }
    }
    dependencies {
        add("testImplementation", libs.library("junit4"))
        add("testImplementation", libs.library("kotlin-test"))
    }
}

/** Kotlin options for the pure-JVM modules (:core:model, :core:recurrence). */
internal fun Project.configureKotlinJvm() {
    extensions.configure<org.gradle.api.plugins.JavaPluginExtension> {
        sourceCompatibility = JAVA_VERSION
        targetCompatibility = JAVA_VERSION
    }
    extensions.configure<KotlinJvmProjectExtension> {
        compilerOptions { applyPlanrDefaults() }
    }
}

private fun KotlinCommonCompilerOptions.applyPlanrDefaults() {
    if (this is KotlinJvmCompilerOptions) jvmTarget.set(JVM_TARGET)
    // kotlin.time.Instant (used by kotlinx-datetime 0.7 / supabase-kt 3.2) is
    // still @ExperimentalTime on Kotlin 2.2; opt in once, project-wide.
    optIn.add("kotlin.time.ExperimentalTime")
}
