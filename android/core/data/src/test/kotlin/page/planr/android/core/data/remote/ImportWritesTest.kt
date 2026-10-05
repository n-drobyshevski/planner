package page.planr.android.core.data.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import page.planr.android.core.model.PlannerEventDraft
import page.planr.android.core.recurrence.EditSemantics

/** The .ics import's bulk writes and its duplicate lookup. */
class ImportWritesTest {

    private fun draft(i: Int, uid: String? = "uid-$i") = PlannerEventDraft(
        workspaceId = Fixtures.WS,
        ownerId = Fixtures.MEMBER_A,
        title = "Event $i",
        start = Instant.parse("2026-10-05T09:00:00Z").plus(kotlin.time.Duration.parse("${i}h")),
        end = Instant.parse("2026-10-05T10:00:00Z").plus(kotlin.time.Duration.parse("${i}h")),
        timeZone = "Europe/Berlin",
        attributes = if (uid == null) JsonObject(emptyMap()) else buildJsonObject { put("icalUid", uid) },
    )

    @Test
    fun `createEvents inserts 200 rows per statement and returns them in draft order`() = runTest {
        val gateway = FakePostgrestGateway()
        val drafts = (0 until 450).map { draft(it) }

        val created = EventMutations(gateway).createEvents(drafts)

        val inserts = gateway.callsOf<FakePostgrestGateway.Call.Insert>()
        assertEquals(listOf(200, 200, 50), inserts.map { it.rows.size })
        assertEquals(drafts.map { it.title }, created.map { it.title })
        assertEquals(EventPayloads.insertRow(drafts[0]), inserts[0].rows[0])
        assertEquals(JsonPrimitive("uid-0"), inserts[0].rows[0]["attributes"].let { (it as JsonObject)["icalUid"] })
    }

    @Test
    fun `a failed chunk deletes the chunks already written, then rethrows`() = runTest {
        val fake = FakePostgrestGateway()
        var inserts = 0
        val failing = object : PostgrestGateway by fake {
            override suspend fun insert(table: String, rows: List<JsonObject>): List<JsonObject> {
                if (++inserts == 2) error("offline")
                return fake.insert(table, rows)
            }
        }

        assertFailsWith<IllegalStateException> { EventMutations(failing).createEvents((0 until 250).map { draft(it) }) }

        assertTrue(fake.rows(SupabaseTables.EVENTS).isEmpty())
        val deletes = fake.callsOf<FakePostgrestGateway.Call.Delete>()
        assertEquals(listOf(120, 80), deletes.map { (it.filters.single() as RowFilter.In).values.size })
    }

    @Test
    fun `cancel overrides go in as one bulk insert shaped like applyOverride's`() = runTest {
        val gateway = FakePostgrestGateway()
        val at = Instant.parse("2026-10-12T07:00:00Z")
        val inputs = listOf(EditSemantics.cancelOccurrence("ev-1", at), EditSemantics.cancelOccurrence("ev-2", at))

        val stored = EventMutations(gateway).insertCancelOverrides(Fixtures.WS, inputs)

        val insert = gateway.callsOf<FakePostgrestGateway.Call.Insert>().single()
        assertEquals(SupabaseTables.EVENT_OVERRIDES, insert.table)
        assertEquals(inputs.map { EventPayloads.overrideRow(Fixtures.WS, it) }, insert.rows)
        assertEquals(
            mapOf(
                "workspace_id" to JsonPrimitive(Fixtures.WS),
                "event_id" to JsonPrimitive("ev-1"),
                "occurrence_date" to JsonPrimitive("2026-10-12T07:00:00.000Z"),
                "type" to JsonPrimitive("cancel"),
            ),
            insert.rows[0].toMap(),
        )
        assertEquals(listOf("ev-1", "ev-2"), stored.map { it.eventId })
    }

    @Test
    fun `deleteEvents removes the rows in id chunks`() = runTest {
        val gateway = FakePostgrestGateway().apply {
            seed(SupabaseTables.EVENTS, Fixtures.eventRow(id = "a"), Fixtures.eventRow(id = "b"), Fixtures.eventRow(id = "c"))
        }
        EventMutations(gateway).deleteEvents(listOf("a", "b", "a"))
        assertEquals(listOf("c"), gateway.rows(SupabaseTables.EVENTS).map { (it["id"] as JsonPrimitive).content })
        assertEquals(RowFilter.In("id", listOf("a", "b")), gateway.callsOf<FakePostgrestGateway.Call.Delete>().single().filters.single())
    }

    @Test
    fun `the uid lookup asks for the member's events by attributes icalUid, quoted, in chunks`() = runTest {
        val mine = JsonObject(Fixtures.eventRow(id = "mine") + ("attributes" to buildJsonObject { put("icalUid", "x@google.com") }))
        val partners = JsonObject(
            Fixtures.eventRow(id = "partner") + mapOf(
                "attributes" to buildJsonObject { put("icalUid", "x@google.com") },
                "owner_id" to JsonPrimitive("someone-else"),
            ),
        )
        val gateway = FakePostgrestGateway().apply { seed(SupabaseTables.EVENTS, mine, partners, Fixtures.eventRow(id = "plain")) }
        val uids = (0 until 150).map { "u$it" } + listOf("x@google.com", "x@google.com", "", "bad\"quote")

        val found = WorkspaceQueries(gateway).fetchEventsByIcalUid(Fixtures.WS, Fixtures.MEMBER_A, uids)

        assertEquals(listOf("mine"), found.map { it.id })
        val pages = gateway.callsOf<FakePostgrestGateway.Call.SelectPage>()
        assertEquals(2, pages.size)
        val first = pages[0].filters
        assertEquals(RowFilter.Eq("workspace_id", Fixtures.WS), first[0])
        assertEquals(RowFilter.Eq("owner_id", Fixtures.MEMBER_A), first[1])
        val inFilter = first[2] as RowFilter.In
        assertEquals("attributes->>icalUid", inFilter.column)
        assertTrue(inFilter.quoted)
        assertEquals(100, inFilter.values.size)
        assertEquals(51, (pages[1].filters[2] as RowFilter.In).values.size)
    }

    @Test
    fun `no uids means no uid query`() = runTest {
        val gateway = FakePostgrestGateway()
        assertEquals(emptyList(), WorkspaceQueries(gateway).fetchEventsByIcalUid(Fixtures.WS, Fixtures.MEMBER_A, emptyList()))
        assertTrue(gateway.calls.isEmpty())
    }
}
