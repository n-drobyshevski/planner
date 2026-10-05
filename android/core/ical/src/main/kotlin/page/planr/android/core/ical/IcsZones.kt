package page.planr.android.core.ical

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime

/**
 * Time-zone plumbing for the .ics import, a port of lib/ical/zone.ts. Every
 * zone is explicit (never the JVM default), so a wall time resolves to the
 * same instant here and on the web.
 */
object IcsZones {

    private const val DAY_MS = 86_400_000L

    /** Region ids java.time knows, by lower-case spelling (`Intl` matches zone names case-insensitively). */
    private val regionIds: Map<String, String> by lazy {
        ZoneId.getAvailableZoneIds().associateBy { it.lowercase() }
    }

    /**
     * The canonical spelling of [zone] when it names a zone this runtime
     * knows, else null. Fixed offsets (`+05:00`, `GMT+3`) are not zones here,
     * as with `Intl.DateTimeFormat`.
     */
    private fun known(zone: String): String? {
        if (zone.isEmpty() || jsTrim(zone) != zone) return null
        return regionIds[zone.lowercase()]
    }

    /** True when [zone] is an IANA zone this runtime knows. */
    fun isKnownZone(zone: String): Boolean = known(zone) != null

    /**
     * Epoch ms of a wall time in [zone] (`ZonedDateTime.ofLocal`): a repeated
     * time takes the EARLIER instant, a time inside a gap moves forward by the
     * gap's length. Out-of-range fields roll over like JS `Date.UTC`.
     */
    fun wallToInstant(zone: String, y: Int, mo: Int, d: Int, h: Int = 0, mi: Int = 0, s: Int = 0): Long {
        val asUtc = utcMillis(y, mo, d, h, mi, s)
        val local = LocalDateTime.ofEpochSecond(Math.floorDiv(asUtc, 1000L), 0, ZoneOffset.UTC)
        return ZonedDateTime.ofLocal(local, ZoneId.of(known(zone) ?: zone), null).toInstant().toEpochMilli()
    }

    /** JS `Date.UTC(y, mo - 1, d, h, mi, s)`: fields roll over, and years 0–99 mean 1900–1999. */
    internal fun utcMillis(y: Int, mo: Int, d: Int, h: Int = 0, mi: Int = 0, s: Int = 0): Long {
        val year = if (y in 0..99) 1900 + y else y
        val day = LocalDate.of(year, 1, 1).plusMonths(mo - 1L).plusDays(d - 1L).toEpochDay()
        return day * DAY_MS + h * 3_600_000L + mi * 60_000L + s * 1_000L
    }

    /**
     * Windows time-zone names (Outlook / Exchange exports put these in TZID)
     * to IANA, from CLDR's windowsZones "001" territory — the same table as
     * `WINDOWS_ZONES` in zone.ts.
     */
    val WINDOWS_ZONES: Map<String, String> = mapOf(
        "UTC" to "UTC",
        "GMT Standard Time" to "Europe/London",
        "Greenwich Standard Time" to "Atlantic/Reykjavik",
        "W. Europe Standard Time" to "Europe/Berlin",
        "Central Europe Standard Time" to "Europe/Budapest",
        "Central European Standard Time" to "Europe/Warsaw",
        "Romance Standard Time" to "Europe/Paris",
        "E. Europe Standard Time" to "Europe/Chisinau",
        "FLE Standard Time" to "Europe/Kiev",
        "GTB Standard Time" to "Europe/Bucharest",
        "Kaliningrad Standard Time" to "Europe/Kaliningrad",
        "Russian Standard Time" to "Europe/Moscow",
        "Belarus Standard Time" to "Europe/Minsk",
        "Turkey Standard Time" to "Europe/Istanbul",
        "Israel Standard Time" to "Asia/Jerusalem",
        "Arabian Standard Time" to "Asia/Dubai",
        "Caucasus Standard Time" to "Asia/Yerevan",
        "Georgian Standard Time" to "Asia/Tbilisi",
        "Ekaterinburg Standard Time" to "Asia/Yekaterinburg",
        "N. Central Asia Standard Time" to "Asia/Novosibirsk",
        "North Asia Standard Time" to "Asia/Krasnoyarsk",
        "North Asia East Standard Time" to "Asia/Irkutsk",
        "Yakutsk Standard Time" to "Asia/Yakutsk",
        "Vladivostok Standard Time" to "Asia/Vladivostok",
        "India Standard Time" to "Asia/Calcutta",
        "China Standard Time" to "Asia/Shanghai",
        "Tokyo Standard Time" to "Asia/Tokyo",
        "AUS Eastern Standard Time" to "Australia/Sydney",
        "Eastern Standard Time" to "America/New_York",
        "Central Standard Time" to "America/Chicago",
        "Mountain Standard Time" to "America/Denver",
        "US Mountain Standard Time" to "America/Phoenix",
        "Pacific Standard Time" to "America/Los_Angeles",
        "Alaskan Standard Time" to "America/Anchorage",
        "Hawaiian Standard Time" to "Pacific/Honolulu",
        "Atlantic Standard Time" to "America/Halifax",
        "SA Pacific Standard Time" to "America/Bogota",
        "E. South America Standard Time" to "America/Sao_Paulo",
        "Argentina Standard Time" to "America/Buenos_Aires",
    )

    /**
     * The IANA zone a TZID names: itself when known, its Windows mapping, or a
     * `/`-separated tail some exporters prepend paths to
     * (`/mozilla.org/…/Europe/Berlin`). Null when nothing resolves.
     *
     * A known id comes back in its canonical spelling (`europe/berlin` →
     * `Europe/Berlin`); the web keeps the spelling it was given.
     */
    fun resolveZone(tzid: String): String? {
        val id = jsTrim(tzid).removePrefix("\"").removeSuffix("\"")
        known(id)?.let { return it }
        WINDOWS_ZONES[id]?.let { return it }
        val parts = id.split("/").filter { it.isNotEmpty() }
        for (i in 0 until parts.size - 1) {
            val tail = parts.subList(i, parts.size).joinToString("/")
            if ('/' in tail) known(tail)?.let { return it }
        }
        return null
    }
}
