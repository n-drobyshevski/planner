package page.planr.android.core.insights.labels

import java.time.ZoneId
import page.planr.android.core.insights.model.Bucket
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.MsWindow

/** The date labels of the Insights views, formatted exactly as the web does. */
object InsightsLabels {
    /** series.ts `bucketTick`: "d" | "d MMM" | "MMM". */
    fun bucketTick(startMs: Long, g: Granularity, zone: ZoneId, l: LabelLocale): String = TODO("A3")

    /** series.ts `bucketLabel`. */
    fun bucketLabel(bucket: Bucket, g: Granularity, zone: ZoneId, l: LabelLocale): String = TODO("A3")

    /** period.ts `rangeText`. */
    fun rangeText(window: MsWindow, zone: ZoneId, l: LabelLocale): String = TODO("A3")

    /** format.ts `formatWeekdayDayMonth`: "EEE, d MMM". */
    fun weekdayDayMonth(ms: Long, zone: ZoneId, l: LabelLocale): String = TODO("A3")

    /** view-selectors.ts `formatWeekdayDayMonthShort`: "EEE d MMM". */
    fun weekdayDayMonthNoComma(ms: Long, zone: ZoneId, l: LabelLocale): String = TODO("A3")

    /** view-selectors.ts `formatDayDetailTitle`: "EEEE, d MMM yyyy". */
    fun dayTitle(ms: Long, zone: ZoneId, l: LabelLocale): String = TODO("A3")

    /** view-selectors.ts `formatWeekdayDayMonthLong`: "EEEE d MMMM". */
    fun weekdayDayMonthWide(ms: Long, zone: ZoneId, l: LabelLocale): String = TODO("A3")

    /** format.ts `formatTime`: "HH:mm". */
    fun time(ms: Long, zone: ZoneId): String = TODO("A3")

    /** local.ts: "yyyy-MM-dd". */
    fun dateKey(ms: Long, zone: ZoneId): String = TODO("A3")
}
