package page.planr.android.core.insights.labels

import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import page.planr.android.core.insights.model.Bucket
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.MsWindow

/**
 * The date labels of the Insights views, formatted exactly as the web does.
 *
 * Each label is the date-fns pattern of its web counterpart, assembled by hand:
 * java.time only extracts the local fields in the given zone, and every name
 * comes from [DateNames] (the date-fns tables), never from the JVM locale.
 */
object InsightsLabels {
    /** series.ts `bucketTick`: "d" | "d MMM" | "MMM". */
    fun bucketTick(startMs: Long, g: Granularity, zone: ZoneId, l: LabelLocale): String {
        val t = local(startMs, zone)
        return when (g) {
            Granularity.Day -> d(t)
            Granularity.Week -> dMmm(t, l)
            Granularity.Month -> DateNames.monthAbbr(t.monthValue, l)
        }
    }

    /** series.ts `bucketLabel`: "Mon, 8 Jun" · "8 – 14 Jun 2026" · "June 2026". */
    fun bucketLabel(bucket: Bucket, g: Granularity, zone: ZoneId, l: LabelLocale): String {
        val start = local(bucket.start, zone)
        return when (g) {
            Granularity.Day -> weekdayDayMonth(start, l)
            Granularity.Month -> "${DateNames.monthWide(start.monthValue, l)} ${yyyy(start)}"
            Granularity.Week -> {
                val last = local(bucket.end - 1, zone)
                val left = if (sameMonth(start, last)) d(start) else dMmm(start, l)
                "$left – ${dMmmYyyy(last, l)}"
            }
        }
    }

    /** period.ts `rangeText`: "8 – 14 Jun 2026" / "28 May – 3 Jun 2026" / "30 Dec 2025 – 4 Jan 2026". */
    fun rangeText(window: MsWindow, zone: ZoneId, l: LabelLocale): String {
        val start = local(window.start, zone)
        val last = local(window.end - 1, zone) // exclusive end → a ms inside the last day
        val left = when {
            sameMonth(start, last) -> d(start)
            start.year == last.year -> dMmm(start, l)
            else -> dMmmYyyy(start, l)
        }
        return "$left – ${dMmmYyyy(last, l)}"
    }

    /** format.ts `formatWeekdayDayMonth`: "EEE, d MMM". */
    fun weekdayDayMonth(ms: Long, zone: ZoneId, l: LabelLocale): String = weekdayDayMonth(local(ms, zone), l)

    /** view-selectors.ts `formatWeekdayDayMonthShort`: "EEE d MMM". */
    fun weekdayDayMonthNoComma(ms: Long, zone: ZoneId, l: LabelLocale): String {
        val t = local(ms, zone)
        return "${DateNames.weekdayAbbr(t.dayOfWeek.value, l)} ${dMmm(t, l)}"
    }

    /** view-selectors.ts `formatDayDetailTitle`: "EEEE, d MMM yyyy". */
    fun dayTitle(ms: Long, zone: ZoneId, l: LabelLocale): String {
        val t = local(ms, zone)
        return "${DateNames.weekdayWide(t.dayOfWeek.value, l)}, ${dMmmYyyy(t, l)}"
    }

    /** view-selectors.ts `formatWeekdayDayMonthLong`: "EEEE d MMMM". */
    fun weekdayDayMonthWide(ms: Long, zone: ZoneId, l: LabelLocale): String {
        val t = local(ms, zone)
        return "${DateNames.weekdayWide(t.dayOfWeek.value, l)} ${d(t)} ${DateNames.monthWide(t.monthValue, l)}"
    }

    /** format.ts `formatTime`: "HH:mm". */
    fun time(ms: Long, zone: ZoneId): String {
        val t = local(ms, zone)
        return "${pad(t.hour, 2)}:${pad(t.minute, 2)}"
    }

    /** local.ts `dateKeyInZone`: "yyyy-MM-dd". */
    fun dateKey(ms: Long, zone: ZoneId): String {
        val t = local(ms, zone)
        return "${yyyy(t)}-${pad(t.monthValue, 2)}-${pad(t.dayOfMonth, 2)}"
    }

    private fun local(ms: Long, zone: ZoneId): ZonedDateTime = Instant.ofEpochMilli(ms).atZone(zone)

    private fun weekdayDayMonth(t: ZonedDateTime, l: LabelLocale): String =
        "${DateNames.weekdayAbbr(t.dayOfWeek.value, l)}, ${dMmm(t, l)}"

    /** date-fns compares `format(…, "MMM yyyy")` strings; the names are distinct per month. */
    private fun sameMonth(a: ZonedDateTime, b: ZonedDateTime): Boolean = a.year == b.year && a.monthValue == b.monthValue

    private fun d(t: ZonedDateTime): String = t.dayOfMonth.toString()

    private fun dMmm(t: ZonedDateTime, l: LabelLocale): String = "${d(t)} ${DateNames.monthAbbr(t.monthValue, l)}"

    private fun dMmmYyyy(t: ZonedDateTime, l: LabelLocale): String = "${dMmm(t, l)} ${yyyy(t)}"

    /** date-fns "yyyy": the year zero-padded to four digits. */
    private fun yyyy(t: ZonedDateTime): String = pad(t.year, 4)

    private fun pad(n: Int, width: Int): String = n.toString().padStart(width, '0')
}
