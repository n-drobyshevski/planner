package page.planr.android.core.design.glance

import androidx.glance.color.ColorProvider
import androidx.glance.material3.ColorProviders
import androidx.glance.unit.ColorProvider
import page.planr.android.core.design.theme.DarkPlanrColors
import page.planr.android.core.design.theme.LightPlanrColors
import page.planr.android.core.design.theme.PlanrDarkColorScheme
import page.planr.android.core.design.theme.PlanrLightColorScheme

/**
 * Day/night color providers for Glance widgets, built from the same tokens as
 * the app theme. Pass [PlanrGlanceColors.scheme] to `GlanceTheme(colors = ...)`.
 */
object PlanrGlanceColors {
    /** Material roles for `GlanceTheme` (an `androidx.glance.color.ColorProviders`). */
    val scheme = ColorProviders(
        light = PlanrLightColorScheme,
        dark = PlanrDarkColorScheme,
    )

    val memberA: ColorProvider = ColorProvider(
        day = LightPlanrColors.memberA.fill,
        night = DarkPlanrColors.memberA.fill,
    )
    val memberB: ColorProvider = ColorProvider(
        day = LightPlanrColors.memberB.fill,
        night = DarkPlanrColors.memberB.fill,
    )
    val shared: ColorProvider = ColorProvider(
        day = LightPlanrColors.shared.fill,
        night = DarkPlanrColors.shared.fill,
    )

    /** Ink over a member/shared fill. */
    val onMeaningFill: ColorProvider = ColorProvider(
        day = LightPlanrColors.memberA.onFill,
        night = DarkPlanrColors.memberA.onFill,
    )

    val card: ColorProvider = ColorProvider(day = LightPlanrColors.card, night = DarkPlanrColors.card)
    val hairline: ColorProvider = ColorProvider(day = LightPlanrColors.hairline, night = DarkPlanrColors.hairline)
}
