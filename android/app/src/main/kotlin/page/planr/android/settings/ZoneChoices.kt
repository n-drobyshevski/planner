package page.planr.android.settings

import java.time.ZoneId

/** "Europe/Kaliningrad" → "Europe / Kaliningrad", for display only (`friendly` in timezone-settings.tsx). */
fun zoneLabel(id: String): String = id.replace('_', ' ').replace("/", " / ")

/** Another member's explicit zone, offered as a shortcut ("In your workspace"). */
data class PartnerZone(val name: String, val zone: String)

/** The zone picker's lists: what to offer, in what order, for a search. */
object ZoneChoices {
    /**
     * Region zones the phone knows ("Area/City"), sorted. Bare aliases
     * ("EST", "Cuba") and the "Etc/" offsets are left out, like the editor's
     * picker; UTC is kept as the one neutral choice.
     */
    fun all(ids: Set<String> = ZoneId.getAvailableZoneIds()): List<String> =
        (ids.filter { '/' in it && !it.startsWith("Etc/") && !it.startsWith("SystemV/") } + UTC).distinct().sorted()

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

    private const val UTC = "UTC"
}
