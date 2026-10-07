package page.planr.android.core.data.sync

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant
import page.planr.android.core.data.remote.Fixtures

/** `row_gone` broadcast payloads, as the migration's trigger builds them. */
class RowGoneTest {

    @Test
    fun `parses a shared event delete with what went`() {
        val gone = RowGone.parse(
            Fixtures.row(
                """
                {"table":"events","id":"e1","kind":"delete","owner_id":"$ME","actor":"$PARTNER",
                 "title":"Dinner","starts_at":"2026-06-01T17:00:00+00:00","ends_at":"2026-06-01T18:30:00+00:00"}
                """,
            ),
        )

        assertEquals(
            RowGone(
                table = "events",
                id = "e1",
                kind = RowGone.Kind.Delete,
                ownerId = ME,
                actor = PARTNER,
                title = "Dinner",
                start = Instant.parse("2026-06-01T17:00:00Z"),
                end = Instant.parse("2026-06-01T18:30:00Z"),
            ),
            gone,
        )
    }

    @Test
    fun `a private row, a shared row and a service write leave the optional fields null`() {
        val gone = RowGone.parse(
            Fixtures.row("""{"table":"categories","id":"c1","kind":"delete","owner_id":null,"actor":null}"""),
        )!!

        assertNull(gone.ownerId)
        assertNull(gone.actor)
        assertNull(gone.title)
        assertNull(gone.start)
        assertNull(gone.end)
    }

    @Test
    fun `reads the fields from an envelope too`() {
        val gone = RowGone.parse(
            Fixtures.row(
                """{"event":"row_gone","payload":{"table":"tasks","id":"t1","kind":"hidden","owner_id":"$PARTNER"}}""",
            ),
        )

        assertEquals(RowGone.Kind.Hidden, gone?.kind)
        assertEquals("t1", gone?.id)
    }

    @Test
    fun `malformed payloads and unknown kinds are ignored`() {
        assertNull(RowGone.parse(Fixtures.row("""{"id":"e1","kind":"delete"}""")))
        assertNull(RowGone.parse(Fixtures.row("""{"table":"events","kind":"delete"}""")))
        assertNull(RowGone.parse(Fixtures.row("""{"table":"events","id":"","kind":"delete"}""")))
        assertNull(RowGone.parse(Fixtures.row("""{"table":"events","id":"e1","kind":"archived"}""")))
        assertNull(RowGone.parse(Fixtures.row("""{"table":"events","id":"e1"}""")))
    }

    @Test
    fun `an unreadable time is dropped, not fatal`() {
        val gone = RowGone.parse(
            Fixtures.row("""{"table":"events","id":"e1","kind":"delete","starts_at":"soon"}"""),
        )

        assertNull(gone?.start)
    }

    @Test
    fun `a delete removes the row for everyone`() {
        val gone = RowGone("events", "e1", RowGone.Kind.Delete, ownerId = ME, actor = ME)

        assertTrue(gone.removesFor(ME))
        assertTrue(gone.removesFor(PARTNER))
    }

    @Test
    fun `a row turned private stays with its owner and leaves the partner`() {
        val gone = RowGone("tasks", "t1", RowGone.Kind.Hidden, ownerId = ME, actor = ME)

        assertFalse(gone.removesFor(ME))
        assertTrue(gone.removesFor(PARTNER))
        assertTrue(gone.removesFor(null), "an unknown viewer must not keep someone's private row")
    }

    @Test
    fun `the delete it applies carries the id`() {
        val change = RowGone("events", "e1", RowGone.Kind.Delete, ownerId = null, actor = null).toDelete()

        assertEquals(Fixtures.row("""{"id":"e1"}"""), change.oldRecord)
    }

    @Test
    fun `a deleted timeslot request refreshes its owner's Inbox only`() {
        val gone = RowGone.parse(
            Fixtures.row("""{"table":"timeslot_requests","id":"r1","kind":"delete","owner_id":"$ME","actor":"$ME"}"""),
        )!!

        assertTrue(gone.isRequestOf(ME))
        assertFalse(gone.isRequestOf(PARTNER), "the partner hears of it too, and ignores it")
        assertFalse(RowGone("events", "e1", RowGone.Kind.Delete, ownerId = ME, actor = ME).isRequestOf(ME))
    }

    @Test
    fun `topic matches the realtime messages policy`() {
        assertEquals("workspace:${Fixtures.WS}:sync", RowGone.topic(Fixtures.WS))
    }

    private companion object {
        const val ME = Fixtures.MEMBER_A
        const val PARTNER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    }
}
