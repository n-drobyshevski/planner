import com.android.build.api.dsl.LibraryExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure
import page.planr.buildlogic.configureKotlinAndroid
import page.planr.buildlogic.libs
import page.planr.buildlogic.versionOf

/** `planr.android.library`: every Android library module (core:*, feature:*, widgets). */
class AndroidLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("com.android.library")
        pluginManager.apply("org.jetbrains.kotlin.android")

        extensions.configure<LibraryExtension> {
            configureKotlinAndroid(this)
            val targetSdk = libs.versionOf("targetSdk").toInt()
            testOptions.targetSdk = targetSdk
            lint.targetSdk = targetSdk
        }
    }
}
