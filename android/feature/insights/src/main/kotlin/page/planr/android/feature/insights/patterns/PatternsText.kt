package page.planr.android.feature.insights.patterns

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import page.planr.android.core.insights.model.Daypart
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.LedeArg
import page.planr.android.core.insights.model.LedeLine
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.ui.components.durationText

/**
 * A lede line as a resource plus its args, before the args are formatted:
 * Context-free, so a JVM test can check every key against the strings file.
 */
internal data class StringSpec(@param:StringRes val id: Int, val args: List<LedeArg>)

/** The Patterns tab's resource lookups (pure). */
internal object PatternsText {

    /** ledes.ts `derivePatternsLede` keys → strings_insights_patterns.xml; args in format order. */
    fun ledeSpec(line: LedeLine): StringSpec = when (line.key) {
        "lede.patternsHeadline" ->
            StringSpec(R.string.insights_patterns_lede_headline, listOf(line.arg("weekday"), line.arg("ms")))
        "lede.patternsSupportDaypart" ->
            StringSpec(R.string.insights_patterns_lede_support_daypart, listOf(line.arg("daypart")))
        "lede.patternsSupportBlock" ->
            StringSpec(R.string.insights_patterns_lede_support_block, listOf(line.arg("ms")))
        else -> throw IllegalArgumentException("Not a Patterns lede: ${line.key}")
    }

    /** The short daypart label: the web's message up to the first space ("Morning (5–12)" → "Morning"). */
    @StringRes
    fun daypart(d: Daypart): Int = when (d) {
        Daypart.Morning -> R.string.insights_patterns_daypart_morning
        Daypart.Midday -> R.string.insights_patterns_daypart_midday
        Daypart.Evening -> R.string.insights_patterns_daypart_evening
        Daypart.Night -> R.string.insights_patterns_daypart_night
    }

    /** `balance.contextMix`, one string per granularity. */
    @StringRes
    fun contextMix(g: Granularity): Int = when (g) {
        Granularity.Day -> R.string.insights_patterns_context_mix_day
        Granularity.Week -> R.string.insights_patterns_context_mix_week
        Granularity.Month -> R.string.insights_patterns_context_mix_month
    }

    /** `balance.contextMixAria`, one string per granularity; one arg, the period label. */
    @StringRes
    fun contextMixAria(g: Granularity): Int = when (g) {
        Granularity.Day -> R.string.insights_patterns_context_mix_aria_day
        Granularity.Week -> R.string.insights_patterns_context_mix_aria_week
        Granularity.Month -> R.string.insights_patterns_context_mix_aria_month
    }

    /** hour-heatmap.tsx STEP_LABELS: 0 · <30m · <1h · <2h · 2h+. */
    val stepLabels: List<Int> = listOf(
        R.string.insights_patterns_step_0,
        R.string.insights_patterns_step_1,
        R.string.insights_patterns_step_2,
        R.string.insights_patterns_step_3,
        R.string.insights_patterns_step_4,
    )

    private fun LedeLine.arg(name: String): LedeArg =
        requireNotNull(args[name]) { "$key: missing arg $name" }
}

/** A Patterns lede line in the current locale. */
@Composable
internal fun ledeText(line: LedeLine): String {
    val spec = PatternsText.ledeSpec(line)
    val weekdays = stringArrayResource(R.array.insights_patterns_weekdays_full)
    val args = spec.args.map<LedeArg, Any> { arg ->
        when (arg) {
            is LedeArg.Duration -> durationText(arg.ms)
            is LedeArg.Weekday -> weekdays[arg.index]
            is LedeArg.DaypartRef -> stringResource(PatternsText.daypart(arg.daypart))
            is LedeArg.Num -> arg.value
            else -> throw IllegalArgumentException("${line.key}: unexpected arg $arg")
        }
    }
    return stringResource(spec.id, *args.toTypedArray())
}
