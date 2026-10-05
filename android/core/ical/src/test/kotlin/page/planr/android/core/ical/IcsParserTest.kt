package page.planr.android.core.ical

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue
import page.planr.android.core.model.EventStatus

// Parity lives in the golden fixtures; these pin the Kotlin-side details.
class IcsParserTest {

    private fun ms(iso: String) = Instant.parse(iso).toEpochMilli()

    @Test
    fun `wall times resolve like ZonedDateTime ofLocal across DST`() {
        // Spring gap: 02:30 doesn't exist in Berlin, it moves forward to 03:30 CEST.
        assertEquals(ms("2026-03-29T01:30:00Z"), IcsZones.wallToInstant("Europe/Berlin", 2026, 3, 29, 2, 30))
        // Autumn overlap: 02:30 happens twice; the earlier (CEST) instant wins.
        assertEquals(ms("2026-10-25T00:30:00Z"), IcsZones.wallToInstant("Europe/Berlin", 2026, 10, 25, 2, 30))
        assertEquals(ms("2026-10-25T02:15:00Z"), IcsZones.wallToInstant("Europe/Berlin", 2026, 10, 25, 3, 15))
        // Fields roll over like Date.UTC.
        assertEquals(ms("2027-01-01T00:00:00Z"), IcsZones.wallToInstant("UTC", 2026, 12, 32))
    }

    @Test
    fun `zones resolve from IANA, Windows and path-style TZIDs`() {
        assertEquals("Europe/Berlin", IcsZones.resolveZone("Europe/Berlin"))
        assertEquals("Europe/Berlin", IcsZones.resolveZone("\"W. Europe Standard Time\""))
        assertEquals("Europe/Moscow", IcsZones.resolveZone("Russian Standard Time"))
        assertEquals("Europe/Paris", IcsZones.resolveZone("/mozilla.org/20050126_1/Europe/Paris"))
        assertEquals("America/Argentina/Buenos_Aires", IcsZones.resolveZone("/x/America/Argentina/Buenos_Aires"))
        assertNull(IcsZones.resolveZone("Mars/Olympus"))
        assertNull(IcsZones.resolveZone("+05:00"))
        assertTrue(IcsZones.isKnownZone("UTC"))
        assertFalse(IcsZones.isKnownZone(" Europe/Berlin"))
        assertFalse(IcsZones.isKnownZone(""))
    }

    @Test
    fun `text unescapes and durations read like the web`() {
        assertEquals("a, b; c\nd\\e", IcsParser.unescapeText("a\\, b\\; c\\nd\\\\e"))
        assertEquals(5_400_000L, IcsParser.parseDuration("PT1H30M"))
        assertEquals(-604_800_000L, IcsParser.parseDuration("-P1W"))
        assertEquals(86_400_000L, IcsParser.parseDuration(" P1D "))
        assertNull(IcsParser.parseDuration("P"))
        assertNull(IcsParser.parseDuration("PT"))
        assertNull(IcsParser.parseDuration("1H"))
    }

    @Test
    fun `an all-day replaced occurrence is cancelled on its series and imported on its own`() {
        val text = """
            BEGIN:VCALENDAR
            BEGIN:VEVENT
            UID:s1
            DTSTART;VALUE=DATE:20261005
            RRULE:FREQ=DAILY;COUNT=5
            SUMMARY:Series
            END:VEVENT
            BEGIN:VEVENT
            UID:s1
            RECURRENCE-ID;VALUE=DATE:20261007
            DTSTART;VALUE=DATE:20261008
            SUMMARY:Moved
            STATUS:TENTATIVE
            END:VEVENT
            END:VCALENDAR
        """.trimIndent().replace("\n", "\r\n")

        val events = IcsParser.parse(text, "Europe/Berlin").events

        assertEquals(listOf("s1", "s1#20261007"), events.map { it.key })
        assertEquals(listOf(ms("2026-10-07T00:00:00Z")), events[0].exdates)
        assertEquals("FREQ=DAILY;COUNT=5", events[0].rrule)
        assertNull(events[1].rrule)
        assertEquals(EventStatus.Planned, events[1].status)
        assertEquals(ms("2026-10-09T00:00:00Z"), events[1].end)
    }

    @Test
    fun `a timed series with a floating UNTIL ends in its own zone`() {
        val rule = IcsParser.normalizeRRule("RRULE:FREQ=WEEKLY;UNTIL=20261130T090000;TZID=X", allDay = false, zone = "Europe/Berlin")
        assertEquals(IcsParser.NormalizedRule("FREQ=WEEKLY;UNTIL=20261130T080000Z", ms("2026-11-30T08:00:00Z")), rule)
        assertNull(IcsParser.normalizeRRule("FREQ=HOURLY", allDay = false, zone = "UTC"))
        assertNull(IcsParser.normalizeRRule("FREQ=WEEKLY;BYDAY=XX", allDay = false, zone = "UTC"))
    }

    @Test
    fun `name filters - substring, glob and regex, all case-insensitive`() {
        assertTrue(IcsReview.compileNameFilter("ЙОГА").matches("Йога утром"))
        assertTrue(IcsReview.compileNameFilter("st*up").matches("Daily standup"))
        assertFalse(IcsReview.compileNameFilter("a.b").matches("axb"))
        assertTrue(IcsReview.compileNameFilter("/^call\\b/").matches("Call with Sam"))
        assertIs<NameFilter.InvalidRegex>(IcsReview.compileNameFilter("/(/"))
        assertFalse(IcsReview.compileNameFilter("/(/").matches("anything"))
    }
}
