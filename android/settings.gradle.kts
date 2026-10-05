pluginManagement {
    includeBuild("build-logic")
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "planr-android"

enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")

include(":app")
include(":core:design")
include(":core:model")
include(":core:recurrence")
include(":core:ical")
include(":core:insights")
include(":core:data")
include(":feature:agenda")
include(":feature:tasks")
include(":feature:insights")
include(":feature:quickadd")
include(":widgets")
