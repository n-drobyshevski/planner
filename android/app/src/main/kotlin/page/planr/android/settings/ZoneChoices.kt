package page.planr.android.settings

import android.icu.util.TimeZone as IcuTimeZone
import java.time.ZoneId

/** "Europe/Kaliningrad" → "Europe / Kaliningrad", for display only (`friendly` in timezone-settings.tsx). */
fun zoneLabel(id: String): String = id.replace('_', ' ').replace("/", " / ")

/** Another member's explicit zone, offered as a shortcut ("In your workspace"). */
data class PartnerZone(val name: String, val zone: String)

/** The zone picker's lists: what to offer, in what order, for a search. */
object ZoneChoices {
    /**
     * Region zones the phone knows ("Area/City"), one per zone, sorted, like
     * the web's `Intl.supportedValuesOf('timeZone')`. Legacy aliases
     * ("Asia/Calcutta" beside "Asia/Kolkata", "US/Eastern"), bare names
     * ("EST", "Cuba") and the "Etc/" offsets are left out; UTC is kept as the
     * one neutral choice. [canonical] maps an id to its canonical id (null
     * when it doesn't know it); the platform's ICU by default.
     */
    fun all(
        ids: Set<String> = ZoneId.getAvailableZoneIds(),
        canonical: (String) -> String? = ::icuCanonical,
    ): List<String> =
        (ids.map { primary(it, ids, canonical) }.filter(::isRegion) + UTC).distinct().sorted()

    /**
     * How a saved [zone] appears in [all]: a legacy alias ("Asia/Calcutta",
     * "US/Eastern") reads, and is selected, as its primary id.
     */
    fun displayed(
        zone: String,
        ids: Set<String> = ZoneId.getAvailableZoneIds(),
        canonical: (String) -> String? = ::icuCanonical,
    ): String = if (zone == UTC) zone else primary(zone, ids, canonical)

    /**
     * [all] for [query] (matched against the id and its readable label,
     * ignoring case), with the device zone leading when it matches, so the
     * usual choice is one tap away.
     */
    fun filter(all: List<String>, deviceZone: String, query: String): List<String> {
        val matching = all.filter { matches(it, query) }
        return if (deviceZone in matching) listOf(deviceZone) + (matching - deviceZone) else matching
    }

    /** The partner shortcuts matching [query] (by name or zone). */
    fun partners(partners: List<PartnerZone>, query: String): List<PartnerZone> =
        partners.filter { matches(it.zone, query) || it.name.contains(query.trim(), ignoreCase = true) }

    fun matches(zone: String, query: String): Boolean {
        val q = query.trim()
        if (q.isEmpty()) return true
        return zone.contains(q.replace(' ', '_'), ignoreCase = true) || zoneLabel(zone).contains(q, ignoreCase = true)
    }

    /**
     * The primary IANA id for [id]. ICU's canonical ids are CLDR's, which keep
     * a zone's first name across IANA renames ("Asia/Calcutta"), so those move
     * to the current name when the phone knows it. An id [canonical] doesn't
     * know stays as it is.
     */
    private fun primary(id: String, ids: Set<String>, canonical: (String) -> String?): String {
        val cldr = canonical(id) ?: return id
        val iana = IANA_RENAMES[cldr]
        return if (iana != null && iana in ids) iana else cldr
    }

    private fun isRegion(id: String): Boolean =
        '/' in id && !id.startsWith("Etc/") && !id.startsWith("SystemV/")

    private fun icuCanonical(id: String): String? =
        runCatching { IcuTimeZone.getCanonicalID(id) }.getOrNull()

    private const val UTC = "UTC"

    /** CLDR canonical ids that IANA has since renamed (CLDR keeps the first name). */
    private val IANA_RENAMES = mapOf(
        "Africa/Asmera" to "Africa/Asmara",
        "America/Buenos_Aires" to "America/Argentina/Buenos_Aires",
        "America/Catamarca" to "America/Argentina/Catamarca",
        "America/Coral_Harbour" to "America/Atikokan",
        "America/Cordoba" to "America/Argentina/Cordoba",
        "America/Godthab" to "America/Nuuk",
        "America/Indianapolis" to "America/Indiana/Indianapolis",
        "America/Jujuy" to "America/Argentina/Jujuy",
        "America/Louisville" to "America/Kentucky/Louisville",
        "America/Mendoza" to "America/Argentina/Mendoza",
        "Asia/Calcutta" to "Asia/Kolkata",
        "Asia/Katmandu" to "Asia/Kathmandu",
        "Asia/Rangoon" to "Asia/Yangon",
        "Asia/Saigon" to "Asia/Ho_Chi_Minh",
        "Atlantic/Faeroe" to "Atlantic/Faroe",
        "Europe/Kiev" to "Europe/Kyiv",
        "Pacific/Enderbury" to "Pacific/Kanton",
        "Pacific/Ponape" to "Pacific/Pohnpei",
        "Pacific/Truk" to "Pacific/Chuuk",
    )
}
