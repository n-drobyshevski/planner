import com.android.build.api.dsl.ApplicationExtension
import com.android.build.api.dsl.CommonExtension
import com.android.build.api.dsl.LibraryExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.getByType
import page.planr.buildlogic.libs
import page.planr.buildlogic.library

/**
 * `planr.android.compose`: Compose compiler + the Material 3 baseline. Apply
 * after `planr.android.application` or `planr.android.library`.
 */
class AndroidComposeConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("org.jetbrains.kotlin.plugin.compose")

        pluginManager.withPlugin("com.android.application") {
            enableCompose(extensions.getByType<ApplicationExtension>())
        }
        pluginManager.withPlugin("com.android.library") {
            enableCompose(extensions.getByType<LibraryExtension>())
        }

        dependencies {
            val bom = libs.library("androidx-compose-bom")
            add("implementation", platform(bom))
            add("implementation", libs.library("androidx-compose-ui"))
            add("implementation", libs.library("androidx-compose-ui-graphics"))
            add("implementation", libs.library("androidx-compose-foundation"))
            add("implementation", libs.library("androidx-compose-material3"))
            add("implementation", libs.library("androidx-compose-ui-tooling-preview"))
            add("debugImplementation", libs.library("androidx-compose-ui-tooling"))
        }
    }

    private fun enableCompose(android: CommonExtension<*, *, *, *, *, *>) {
        android.buildFeatures.compose = true
    }
}
