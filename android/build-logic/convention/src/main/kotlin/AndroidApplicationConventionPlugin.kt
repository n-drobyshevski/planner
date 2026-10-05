import com.android.build.api.dsl.ApplicationExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure
import page.planr.buildlogic.configureKotlinAndroid
import page.planr.buildlogic.libs
import page.planr.buildlogic.versionOf

/** `planr.android.application`: the :app module (AGP application + Kotlin). */
class AndroidApplicationConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("com.android.application")
        pluginManager.apply("org.jetbrains.kotlin.android")

        extensions.configure<ApplicationExtension> {
            configureKotlinAndroid(this)
            defaultConfig.targetSdk = libs.versionOf("targetSdk").toInt()
        }
    }
}
