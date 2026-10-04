package page.planr.android.core.design.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import page.planr.android.core.design.R

/** Latin brand face. Has no basic Cyrillic, so Russian UI uses [ManropeFamily]. */
val PlusJakartaSansFamily = FontFamily(
    Font(R.font.plus_jakarta_sans_regular, FontWeight.Normal),
    Font(R.font.plus_jakarta_sans_medium, FontWeight.Medium),
    Font(R.font.plus_jakarta_sans_semibold, FontWeight.SemiBold),
)

/** Cyrillic companion to Jakarta (the web's `--font-manrope` fallback). */
val ManropeFamily = FontFamily(
    Font(R.font.manrope_regular, FontWeight.Normal),
    Font(R.font.manrope_medium, FontWeight.Medium),
    Font(R.font.manrope_semibold, FontWeight.SemiBold),
)

/** Times and aligned figures only. */
val GeistMonoFamily = FontFamily(
    Font(R.font.geist_mono_regular, FontWeight.Normal),
    Font(R.font.geist_mono_medium, FontWeight.Medium),
)

/** OpenType feature for tabular numerals (The Tabular-Time Rule). */
const val TABULAR_NUMS = "tnum"

/**
 * The shallow scale (DESIGN.md §3): it tops out near 16sp; hierarchy comes from
 * weight, color and spacing. Display/headline roles are deliberately capped so
 * no Material component can introduce a display tier.
 */
fun planrTypography(sans: FontFamily): Typography {
    val title = TextStyle(fontFamily = sans, fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 22.sp)
    val body = TextStyle(fontFamily = sans, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 21.sp)
    val label = TextStyle(fontFamily = sans, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 14.sp)
    val capped = title.copy(fontSize = 18.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold)
    return Typography(
        displayLarge = capped,
        displayMedium = capped,
        displaySmall = capped,
        headlineLarge = capped,
        headlineMedium = capped,
        headlineSmall = capped,
        titleLarge = capped,
        titleMedium = title,
        titleSmall = title.copy(fontSize = 14.sp, lineHeight = 20.sp),
        // 16sp body-large is the input floor on phones (DESIGN.md: inputs at 16px).
        bodyLarge = body.copy(fontSize = 16.sp, lineHeight = 24.sp),
        bodyMedium = body,
        bodySmall = body.copy(fontSize = 12.sp, lineHeight = 17.sp),
        labelLarge = label.copy(fontSize = 14.sp, lineHeight = 20.sp),
        labelMedium = label,
        labelSmall = label.copy(fontSize = 11.sp, lineHeight = 13.sp, letterSpacing = 0.01.em),
    )
}

/** Styles outside Material's roles; read through [PlanrTheme.type]. */
@Immutable
data class PlanrExtendedTypography(
    /** Event times: Geist Mono, 11sp, tabular numerals. */
    val time: TextStyle,
    /** Larger aligned figures (e.g. the agenda's hour labels). */
    val timeMedium: TextStyle,
)

val DefaultPlanrExtendedTypography = PlanrExtendedTypography(
    time = TextStyle(
        fontFamily = GeistMonoFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 11.sp,
        lineHeight = 13.sp,
        fontFeatureSettings = TABULAR_NUMS,
    ),
    timeMedium = TextStyle(
        fontFamily = GeistMonoFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 13.sp,
        lineHeight = 16.sp,
        fontFeatureSettings = TABULAR_NUMS,
    ),
)

internal val LocalPlanrTypography = staticCompositionLocalOf { DefaultPlanrExtendedTypography }
