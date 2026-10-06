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
