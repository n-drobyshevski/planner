package page.planr.android.feature.agenda.model

import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Instant
import org.junit.Test
import page.planr.android.core.model.Occurrence

class EventRefTest {
    @Test
    fun `a plain id addresses a single event`() {
        val ref = EventRef.parse("3f0e2c1a-0000-4000-8000-000000000001")
        assertEquals("3f0e2c1a-0000-4000-8000-000000000001", ref.eventId)
        assertNull(ref.occurrenceDate)
    }

    @Test
    fun `an occurrence key round-trips`() {
        val at = Instant.parse("2026-10-05T07:00:00Z")
        val key = Occurrence.recurringKey("ev-1", at)
        val ref = EventRef.parse(key)
        assertEquals(EventRef("ev-1", at), ref)
        assertEquals(key, ref.key)
    }
}
