// Planr design system for Compose + Glance: tokens from DESIGN.md and
// .impeccable/design.json (warm paper, one warm-stone accent, member colors).
plugins {
    alias(libs.plugins.planr.android.library)
    alias(libs.plugins.planr.android.compose)
}

android {
    namespace = "page.planr.android.core.design"
}

dependencies {
    api(platform(libs.androidx.compose.bom))
    api(libs.androidx.compose.material3)
    api(libs.androidx.glance.material3)
    // enableEdgeToEdge, for the themed system bars (PlanrSystemBars.kt).
    implementation(libs.androidx.activity.compose)
}
