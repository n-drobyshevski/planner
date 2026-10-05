package page.planr.android.widgets

import android.content.Context
import android.text.format.DateFormat
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.glance.GlanceTheme
import androidx.glance.unit.ColorProvider
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.toJavaLocalDate
import kotlinx.datetime.toJavaLocalTime
import page.planr.android.core.design.glance.PlanrGlanceColors
import page.planr.android.core.design.theme.parseHexColor

/**
 * Date and time labels in the app's language, honouring the device's
 * 12/24-hour setting. (Glance can't load Geist Mono; the system sans has
 * tabular digits, which is what the Tabular-Time Rule asks for.)
 */
internal class WidgetFormats(context: Context) {
    private val locale: Locale = context.resources.configuration.locales[0] ?: Locale.getDefault()
    private val time = pattern(if (DateFormat.is24HourFormat(context)) "Hm" else "hm")
    private val day = pattern("EEEdMMMM")
    private val shortDay = pattern("dMMM")

    fun time(value: LocalTime): String = time.format(value.toJavaLocalTime())

    /** "Mon, 5 October"; capitalised, since Russian weekday names are lower-case. */
    fun day(value: LocalDate): String =
        day.format(value.toJavaLocalDate()).replaceFirstChar { it.titlecase(locale) }

    /** "5 Oct". */
    fun shortDay(value: LocalDate): String = shortDay.format(value.toJavaLocalDate())

    private fun pattern(skeleton: String): DateTimeFormatter =
        DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, skeleton), locale)
}

/**
 * The colour bar for [tone]. A member's own `members.color` wins (it is their
 * identity on both themes); otherwise the design defaults.
 */
@Composable
internal fun toneColor(tone: MemberTone): ColorProvider = when (tone.slot) {
    MemberTone.Slot.Shared -> PlanrGlanceColors.shared
    MemberTone.Slot.MemberA -> memberColor(tone.hex) ?: PlanrGlanceColors.memberA
    MemberTone.Slot.MemberB -> memberColor(tone.hex) ?: PlanrGlanceColors.memberB
    MemberTone.Slot.Neutral -> GlanceTheme.colors.outline
}

private fun memberColor(hex: String?): ColorProvider? =
    parseHexColor(hex, Color.Unspecified).takeIf { it != Color.Unspecified }?.let { ColorProvider(it) }
