package page.planr.android.feature.insights.overview

import androidx.compose.runtime.Composable
import kotlin.math.abs
import page.planr.android.core.insights.js.JsMath
import page.planr.android.core.insights.labels.DurationFormat
import page.planr.android.core.insights.labels.LabelLocale
import page.planr.android.core.insights.model.LedeArg
import page.planr.android.core.insights.model.LedeLine
import page.planr.android.core.insights.model.TotalChange
import page.planr.android.core.insights.model.TotalTrend
import page.planr.android.core.model.Category
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.model.UiText
import page.planr.android.feature.insights.model.resolve
import page.planr.android.feature.insights.ui.components.rememberLabelLocale
import page.planr.android.feature.insights.ui.components.seriesName

/**
 * An Overview lede line in the current locale (messages: lede.overviewHeadline,
 * lede.overviewSupport). Category names resolve through [seriesName].
 */
@Composable
fun ledeText(line: LedeLine, categories: Map<String, Category>): String {
    val locale = rememberLabelLocale()
    val names = line.args.values
        .filterIsInstance<LedeArg.Category>()
        .associate { it.seriesKey to seriesName(it.seriesKey, categories) }
    return ledeSpec(line, locale) { names.getValue(it) }.resolve()
}

/**
 * The resource behind an Overview lede line, without a Context.
 *
 * `lede.overviewHeadline` nests two selects, so it is a frame plus a clause:
 * `insights_overview_lede_headline(total, clause)`, where the clause is
 * `insights_overview_lede_<up|down>_<unit>(pct, magnitude)`,
 * `insights_overview_lede_level_<unit>`, or "" for direction none.
 * `lede.overviewSupport` is `insights_overview_lede_support(name, pct)`.
 */
internal fun ledeSpec(line: LedeLine, locale: LabelLocale, name: (seriesKey: String) -> String): UiText {
    fun duration(k: String) = DurationFormat.format((line.args.getValue(k) as LedeArg.Duration).ms, locale)
    fun num(k: String) = (line.args.getValue(k) as LedeArg.Num).value
    fun select(k: String) = (line.args.getValue(k) as LedeArg.Select).token

    return when (line.key) {
        "lede.overviewHeadline" -> {
            val unit = select("unit")
            val clause = when (select("direction")) {
                "up" -> UiText.Res(upClause(unit), listOf(num("pct"), duration("magnitude")))
                "down" -> UiText.Res(downClause(unit), listOf(num("pct"), duration("magnitude")))
                "level" -> UiText.Res(levelClause(unit))
                else -> UiText.Raw("") // none: no previous period to compare with
            }
            UiText.Res(R.string.insights_overview_lede_headline, listOf(duration("total"), clause))
        }
        "lede.overviewSupport" -> {
            val key = (line.args.getValue("name") as LedeArg.Category).seriesKey
            UiText.Res(R.string.insights_overview_lede_support, listOf(name(key), num("pct")))
        }
        else -> throw IllegalArgumentException("not an Overview lede line: ${line.key}")
    }
}

// The ICU `unit` select: week, month, and other → period.
private fun upClause(unit: String): Int = when (unit) {
    "week" -> R.string.insights_overview_lede_up_week
    "month" -> R.string.insights_overview_lede_up_month
    else -> R.string.insights_overview_lede_up_period
}

private fun downClause(unit: String): Int = when (unit) {
    "week" -> R.string.insights_overview_lede_down_week
    "month" -> R.string.insights_overview_lede_down_month
    else -> R.string.insights_overview_lede_down_period
}

private fun levelClause(unit: String): Int = when (unit) {
    "week" -> R.string.insights_overview_lede_level_week
    "month" -> R.string.insights_overview_lede_level_month
    else -> R.string.insights_overview_lede_level_period
}

/** overview.perDayHeadline: the total and its direction against the previous period. */
internal fun perDayHeadline(change: TotalChange, total: String): UiText = when (change.trend) {
    TotalTrend.None -> UiText.Res(R.string.insights_overview_per_day_headline_none, listOf(total))
    TotalTrend.Level -> UiText.Res(R.string.insights_overview_per_day_headline_level, listOf(total))
    TotalTrend.Up -> UiText.Res(R.string.insights_overview_per_day_headline_up, listOf(total, change.pct))
    TotalTrend.Down -> UiText.Res(R.string.insights_overview_per_day_headline_down, listOf(total, change.pct))
}

/** The per-day footnote: names the typical-day line only when one is drawn. */
internal fun perDayFootnote(typicalDayMs: Double, locale: LabelLocale): UiText =
    if (typicalDayMs > 0) {
        UiText.Res(R.string.insights_overview_per_day_footnote_typical, listOf(DurationFormat.format(typicalDayMs, locale)))
    } else {
        UiText.Res(R.string.insights_overview_per_day_footnote)
    }

/** The per-day chart's spoken summary: aria label, then the sr-only paragraph of overview-tab.tsx. */
internal fun perDayDescription(
    periodLabel: String,
    total: String,
    busiest: Pair<String, String>?,
    topName: String?,
): List<UiText> = listOfNotNull(
    UiText.Res(R.string.insights_overview_per_day_aria, listOf(periodLabel)),
    UiText.Res(R.string.insights_overview_sr_summary, listOf(total, periodLabel)),
    busiest?.let { (day, ms) -> UiText.Res(R.string.insights_overview_sr_busiest, listOf(day, ms)) },
    topName?.let { UiText.Res(R.string.insights_overview_sr_top_context, listOf(it)) },
)

/** The On time figure: a whole percent, or a dash with nothing due. */
internal fun onTimeValue(rate: Double?): String = if (rate == null) DASH else "${JsMath.roundToInt(rate * 100)}%"

/** The On time hint: how many were due, or that nothing was. */
internal fun onTimeHint(dueCount: Int): UiText =
    if (dueCount > 0) {
        UiText.Res(R.string.insights_overview_on_time_due, listOf(dueCount))
    } else {
        UiText.Res(R.string.insights_overview_on_time_nothing)
    }

/** tab-bits.tsx `srPercent`: "42%" of [total], "0%" when there is no total. */
internal fun percentText(ms: Long, total: Long): String = "${JsMath.percentOf(ms.toDouble(), total.toDouble())}%"

/** A shift chip's figure: ▲ / ▼ and the points (overview.shiftPts). */
internal fun shiftFigure(points: Int): Pair<String, UiText> =
    (if (points > 0) "▲ " else "▼ ") to UiText.Res(R.string.insights_overview_shift_pts, listOf(abs(points)))

/** A shift chip's spoken form (overview.shiftPoints). */
internal fun shiftSpoken(name: String, points: Int): UiText = UiText.Res(
    if (points > 0) R.string.insights_overview_shift_points_up else R.string.insights_overview_shift_points_down,
    listOf(name, abs(points)),
)

/** What a stat shows when it has no value (overview-tab.tsx "—"). */
internal const val DASH = "—"
