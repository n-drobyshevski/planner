package page.planr.android.feature.insights.trends

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import java.time.ZoneId
import kotlin.math.abs
import page.planr.android.core.insights.js.JsMath
import page.planr.android.core.insights.labels.DurationFormat
import page.planr.android.core.insights.labels.InsightsLabels
import page.planr.android.core.insights.labels.LabelLocale
import page.planr.android.core.insights.model.AnomalyDirection
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.LedeArg
import page.planr.android.core.insights.model.LedeLine
import page.planr.android.core.insights.model.MsWindow
import page.planr.android.core.insights.model.TrendDirection
import page.planr.android.core.insights.model.TrendKind
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.model.UiText
import page.planr.android.feature.insights.model.resolve
import page.planr.android.feature.insights.ui.components.rememberLabelLocale

/**
 * The Trends tab's strings: the lede mapping and the per-granularity resource
 * picks (the web's ICU selects, one Android string per branch). Pure, so a JVM
 * test can check every branch against the resources without a Context.
 */
internal object TrendsText {

    /**
     * A Trends lede line (ledes.ts `deriveTrendsLede`) as a resource with its
     * args. The headline is a frame (`lede_up` / `lede_down`) plus a rate clause
     * (`lede_rate_<granularity>`) when `hasRate` is "yes", or "" without one;
     * `lede_flat` takes no clause. Durations and bucket labels resolve here, in
     * [locale] and [zone].
     */
    fun ledeSpec(line: LedeLine, zone: ZoneId, locale: LabelLocale): UiText {
        val args = line.args
        fun select(name: String): String = (args.getValue(name) as LedeArg.Select).token
        fun duration(name: String): String = DurationFormat.format((args.getValue(name) as LedeArg.Duration).ms, locale)
        fun granularity(): Granularity = checkNotNull(Granularity.fromId(select("granularity"))) { "granularity" }

        return when (line.key) {
            "lede.trendsNoneHeadline" -> UiText.Res(R.string.insights_trends_lede_none_headline)
            "lede.trendsNoneSupport" -> UiText.Res(R.string.insights_trends_lede_none_support)
            "lede.trendsHeadline" -> {
                val clause = if (select("hasRate") == "yes") {
                    UiText.Res(rateClause(granularity()), listOf(select("sign"), duration("rate")))
                } else {
                    UiText.Raw("")
                }
                when (val direction = select("direction")) {
                    TrendKind.Flat.id -> UiText.Res(R.string.insights_trends_lede_flat)
                    TrendKind.Up.id -> UiText.Res(R.string.insights_trends_lede_up, listOf(clause))
                    TrendKind.Down.id -> UiText.Res(R.string.insights_trends_lede_down, listOf(clause))
                    else -> error("lede.trendsHeadline: unknown direction \"$direction\"")
                }
            }
            "lede.trendsSupport" -> {
                val busiest = args.getValue("busiest") as LedeArg.BucketRef
                val label = InsightsLabels.bucketLabel(MsWindow(busiest.start, busiest.end), busiest.granularity, zone, locale)
                UiText.Res(support(granularity()), listOf(label, duration("ms")))
            }
            else -> error("Not a Trends lede key: ${line.key}")
        }
    }

    @StringRes
    fun rateClause(g: Granularity): Int = when (g) {
        Granularity.Day -> R.string.insights_trends_lede_rate_day
        Granularity.Week -> R.string.insights_trends_lede_rate_week
        Granularity.Month -> R.string.insights_trends_lede_rate_month
    }

    @StringRes
    fun support(g: Granularity): Int = when (g) {
        Granularity.Day -> R.string.insights_trends_lede_support_day
        Granularity.Week -> R.string.insights_trends_lede_support_week
        Granularity.Month -> R.string.insights_trends_lede_support_month
    }

    /** trends.perBucketTitle. */
    @StringRes
    fun perBucketTitle(g: Granularity): Int = when (g) {
        Granularity.Day -> R.string.insights_trends_per_bucket_title_day
        Granularity.Week -> R.string.insights_trends_per_bucket_title_week
        Granularity.Month -> R.string.insights_trends_per_bucket_title_month
    }

    /** trends.perBucketHeadline: busiest label, its duration, then the trend clause (or ""). */
    @StringRes
    fun perBucketHeadline(g: Granularity): Int = when (g) {
        Granularity.Day -> R.string.insights_trends_per_bucket_headline_day
        Granularity.Week -> R.string.insights_trends_per_bucket_headline_week
        Granularity.Month -> R.string.insights_trends_per_bucket_headline_month
    }

    /** trends.perBucketAria: the period label. */
    @StringRes
    fun perBucketAria(g: Granularity): Int = when (g) {
        Granularity.Day -> R.string.insights_trends_per_bucket_aria_day
        Granularity.Week -> R.string.insights_trends_per_bucket_aria_week
        Granularity.Month -> R.string.insights_trends_per_bucket_aria_month
    }

    /** trends.busiestGranularity: the lead figure's label. */
    @StringRes
    fun busiest(g: Granularity): Int = when (g) {
        Granularity.Day -> R.string.insights_trends_busiest_day
        Granularity.Week -> R.string.insights_trends_busiest_week
        Granularity.Month -> R.string.insights_trends_busiest_month
    }

    /** trends.srSummary: total, bucket count, busiest label, its duration. */
    @StringRes
    fun srSummary(g: Granularity): Int = when (g) {
        Granularity.Day -> R.string.insights_trends_sr_summary_day
        Granularity.Week -> R.string.insights_trends_sr_summary_week
        Granularity.Month -> R.string.insights_trends_sr_summary_month
    }

    /** trends.byContextAria: the number of series shown (at most 5). */
    @StringRes
    fun byContextAria(g: Granularity): Int = when (g) {
        Granularity.Day -> R.string.insights_trends_by_context_aria_day
        Granularity.Week -> R.string.insights_trends_by_context_aria_week
        Granularity.Month -> R.string.insights_trends_by_context_aria_month
    }

    /** The per-bucket headline's trend clause (each starts with a space); null without a direction. */
    @StringRes
    fun trendClause(direction: TrendKind?): Int? = when (direction) {
        TrendKind.Up -> R.string.insights_trends_trend_up
        TrendKind.Down -> R.string.insights_trends_trend_down
        TrendKind.Flat -> R.string.insights_trends_trend_flat
        null -> null
    }

    /** An anomaly chip's leading words: the cue for heavy vs light, with no color. */
    @StringRes
    fun unusual(direction: AnomalyDirection): Int = when (direction) {
        AnomalyDirection.High -> R.string.insights_trends_unusually_heavy
        AnomalyDirection.Low -> R.string.insights_trends_unusually_light
    }

    /**
     * The Momentum trend-rate figure: "Level" when flat, else the signed drift
     * per day (`trends.trendRatePerDay`); null without a direction or a slope.
     */
    fun trendRate(trend: TrendDirection, locale: LabelLocale): UiText? {
        val direction = trend.direction ?: return null
        val slope: Double = trend.slopeMsPerBucket ?: return null
        if (direction == TrendKind.Flat) return UiText.Res(R.string.insights_trends_level)
        val sign = if (slope > 0) "+" else MINUS
        return UiText.Res(R.string.insights_trends_trend_rate_per_day, listOf(sign, DurationFormat.format(abs(slope), locale)))
    }

    /** A streak figure (`trends.days`). */
    fun days(count: Int): UiText = UiText.Plural(R.plurals.insights_trends_days, count)

    /** The consistency figure: `Math.round(c * 100)` and a percent sign. */
    fun percent(fraction: Double): String = "${JsMath.roundToInt(fraction * 100)}%"

    /** tab-bits.tsx `srPercent`: [ms] as a whole percent of [total], 0% when nothing was tracked. */
    fun share(ms: Long, total: Long): String = "${JsMath.percentOf(ms.toDouble(), total.toDouble())}%"

    /** U+2212, the web's sign for a falling rate. */
    private const val MINUS = "−"
}

/** A Trends lede line in the current locale. */
@Composable
internal fun ledeText(line: LedeLine, zone: ZoneId): String {
    val locale = rememberLabelLocale()
    return remember(line, zone, locale) { TrendsText.ledeSpec(line, zone, locale) }.resolve()
}
