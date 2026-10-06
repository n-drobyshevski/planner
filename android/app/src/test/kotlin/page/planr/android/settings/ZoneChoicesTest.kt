package page.planr.android.settings

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ZoneChoicesTest {
    private val all = ZoneChoices.all(
        setOf("Europe/Berlin", "America/New_York", "Asia/Tokyo", "Etc/GMT+3", "EST", "UTC", "America/Argentina/Buenos_Aires"),
    )

    @Test
    fun `region zones and UTC are offered, sorted, without aliases and offsets`() {
        assertEquals(
            listOf("America/Argentina/Buenos_Aires", "America/New_York", "Asia/Tokyo", "Europe/Berlin", "UTC"),
            all,
        )
        assertTrue("Europe/Berlin" in ZoneChoices.all(), "the phone's own list")
    }

    /** ICU's canonical ids (CLDR's), for the aliases the phone lists. */
    private val icu = mapOf(
        "Asia/Calcutta" to "Asia/Calcutta",
        "Asia/Kolkata" to "Asia/Calcutta",
        "US/Eastern" to "America/New_York",
        "America/New_York" to "America/New_York",
        "EST" to "Etc/GMT+5",
        "Etc/GMT+3" to "Etc/GMT+3",
        "UTC" to "Etc/UTC",
        "Etc/UTC" to "Etc/UTC",
        "SystemV/EST5" to "Etc/GMT+5",
        "Europe/Kiev" to "Europe/Kiev",
        "Europe/Kyiv" to "Europe/Kiev",
        "Europe/Berlin" to "Europe/Berlin",
    )
    private val phoneIds = icu.keys

    @Test
    fun `only one primary id per zone is offered`() {
        assertEquals(
            listOf("America/New_York", "Asia/Kolkata", "Europe/Berlin", "Europe/Kyiv", "UTC"),
            ZoneChoices.all(phoneIds, icu::get),
        )
    }

    @Test
    fun `a renamed zone keeps its old name when the phone lacks the new one`() {
        val old = phoneIds - "Asia/Kolkata"
        assertTrue("Asia/Calcutta" in ZoneChoices.all(old, icu::get))
    }

    @Test
    fun `a saved alias is shown as its primary id`() {
        assertEquals("Asia/Kolkata", ZoneChoices.displayed("Asia/Calcutta", phoneIds, icu::get))
        assertEquals("America/New_York", ZoneChoices.displayed("US/Eastern", phoneIds, icu::get))
        assertEquals("Europe/Berlin", ZoneChoices.displayed("Europe/Berlin", phoneIds, icu::get))
        assertEquals("UTC", ZoneChoices.displayed("UTC", phoneIds, icu::get))
        assertTrue(ZoneChoices.displayed("US/Eastern", phoneIds, icu::get) in ZoneChoices.all(phoneIds, icu::get))
    }

    @Test
    fun `the device zone leads the list`() {
        assertEquals("Asia/Tokyo", ZoneChoices.filter(all, deviceZone = "Asia/Tokyo", query = "").first())
        assertEquals(all.size, ZoneChoices.filter(all, deviceZone = "Asia/Tokyo", query = "").size)
    }

    @Test
    fun `search matches ids and readable labels, ignoring case`() {
        assertEquals(listOf("America/New_York"), ZoneChoices.filter(all, "Asia/Tokyo", "new york"))
        assertEquals(listOf("America/Argentina/Buenos_Aires"), ZoneChoices.filter(all, "Asia/Tokyo", "argentina / buenos"))
        assertEquals(emptyList(), ZoneChoices.filter(all, "Asia/Tokyo", "atlantis"))
    }

    @Test
    fun `partners match by name or zone`() {
        val partners = listOf(PartnerZone("Boris", "Asia/Tokyo"))
        assertEquals(partners, ZoneChoices.partners(partners, "bor"))
        assertEquals(partners, ZoneChoices.partners(partners, "tokyo"))
        assertEquals(emptyList(), ZoneChoices.partners(partners, "berlin"))
    }

    @Test
    fun `labels read as area and city`() {
        assertEquals("America / New York", zoneLabel("America/New_York"))
    }
}
