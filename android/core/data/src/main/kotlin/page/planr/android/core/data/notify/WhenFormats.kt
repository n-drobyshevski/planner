package page.planr.android.core.data.notify

import kotlin.time.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * "Tue 7 Oct, 14:00–15:00" in [zone]; a span that ends on another day
 * names both ("Tue 7 Oct, 23:00 – Wed 8 Oct, 01:00").
 */
fun WhenFormats.slot(start: Instant, end: Instant, zone: TimeZone): String {
    val from = start.toLocalDateTime(zone)
    val to = end.toLocalDateTime(zone)
    return if (from.date == to.date) {
        "${day(from.date)}, ${time(from.time)}–${time(to.time)}"
    } else {
        "${day(from.date)}, ${time(from.time)} – ${day(to.date)}, ${time(to.time)}"
    }
}

/** "Tue 7 Oct, 14:00": one moment in [zone]. */
fun WhenFormats.moment(at: Instant, zone: TimeZone): String {
    val local = at.toLocalDateTime(zone)
    return "${day(local.date)}, ${time(local.time)}"
}
