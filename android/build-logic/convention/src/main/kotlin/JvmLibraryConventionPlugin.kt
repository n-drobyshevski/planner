import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.tasks.testing.Test
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.withType
import page.planr.buildlogic.configureKotlinJvm
import page.planr.buildlogic.libs
import page.planr.buildlogic.library

/**
 * `planr.jvm.library`: pure Kotlin/JVM modules with no Android dependency
 * (:core:model, :core:recurrence). Tests run on JUnit 5 with kotlin-test.
 */
class JvmLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("org.jetbrains.kotlin.jvm")
            configureKotlinJvm()

            dependencies {
                add("testImplementation", platform(libs.library("junit-bom")))
                add("testImplementation", libs.library("junit-jupiter"))
                add("testImplementation", libs.library("kotlin-test"))
                add("testRuntimeOnly", libs.library("junit-platform-launcher"))
            }

            tasks.withType<Test>().configureEach {
                useJUnitPlatform()
            }

            // Android modules expose `testDebugUnitTest`; alias it here so a single
            // `./gradlew testDebugUnitTest` (local + CI) also runs the JVM modules' tests.
            tasks.register("testDebugUnitTest") {
                group = "verification"
                description = "Runs this JVM module's unit tests (alias of `test`)."
                dependsOn("test")
            }
        }
    }
}
