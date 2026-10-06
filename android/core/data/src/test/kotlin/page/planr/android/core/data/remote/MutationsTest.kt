package page.planr.android.core.data.remote

import java.io.IOException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import page.planr.android.core.data.model.EventPatch
import page.planr.android.core.data.model.TaskPatch
import page.planr.android.core.model.OverrideType
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.recurrence.OccurrencePatch
import page.planr.android.core.recurrence.OverrideInput
import page.planr.android.core.recurrence.PatchField

class MutationsTest {

    private val gateway = FakePostgrestGateway().apply {
        seed(SupabaseTables.EVENTS, Fixtures.eventRow())
        seed(SupabaseTables.TASKS, Fixtures.taskRow())
    }
    private val events = EventMutations(gateway)
    private val tasks = TaskMutations(gateway)

    @Test
    fun `update guarded by the updated_at it was based on succeeds once, then is stale`() = runTest {
        // The row's updated_at has microseconds; the app only knows milliseconds.
        val seen = Instant.parse("2026-05-20T08:15:30.123Z")
        val first = events.updateEvent(Fixtures.EVENT_ID, EventPatch(title = PatchField.Value("A")), seen)
        assertEquals("A", first.title)

        // A second write still based on the old version must not clobber the first.
        val error = assertFailsWith<StaleWriteException> {
            events.updateEvent(Fixtures.EVENT_ID, EventPatch(title = PatchField.Value("B")), seen)
        }
        assertEquals(SupabaseTables.EVENTS, error.table)
        assertEquals("A", gateway.rows(SupabaseTables.EVENTS).single()["title"].let { (it as JsonPrimitive).content })

        // Based on the fresh version it lands again.
        val second = events.updateEvent(Fixtures.EVENT_ID, EventPatch(title = PatchField.Value("B")), first.updatedAt)
        assertEquals("B", second.title)
    }

    @Test
    fun `guard is the 1 ms window around the expected updated_at`() = runTest {
        events.updateEvent(
            Fixtures.EVENT_ID,
            EventPatch(title = PatchField.Value("A")),
            Instant.parse("2026-05-20T08:15:30.123456Z"),
        )
        val update = gateway.callsOf<FakePostgrestGateway.Call.Update>().single()
        assertEquals(
            listOf(
                RowFilter.Eq("id", Fixtures.EVENT_ID),
                RowFilter.Gte("updated_at", "2026-05-20T08:15:30.123Z"),
                RowFilter.Lt("updated_at", "2026-05-20T08:15:30.124Z"),
            ),
            update.filters,
        )
    }

    @Test
    fun `unguarded update of a row RLS hides is stale too`() = runTest {
        assertFailsWith<StaleWriteException> {
            events.updateEvent("missing", EventPatch(title = PatchField.Value("A")))
        }
    }

    @Test
    fun `task update is guarded the same way`() = runTest {
        val seen = Instant.parse("2026-05-20T08:15:30.123Z")
        tasks.updateTask(Fixtures.TASK_ID, TaskPatch(title = PatchField.Value("Paint")), seen)
        val error = assertFailsWith<StaleWriteException> {
            tasks.updateTask(Fixtures.TASK_ID, TaskPatch(title = PatchField.Value("Brush")), seen)
        }
        assertEquals(SupabaseTables.TASKS, error.table)
    }

    @Test
    fun `applyOverride upserts on the occurrence key and returns the prior row`() = runTest {
        val date = Instant.parse("2026-06-02T07:00:00Z")
        val first = events.applyOverride(Fixtures.WS, OverrideInput(Fixtures.EVENT_ID, date, OverrideType.Cancel))
        assertNull(first.prior.row)

        val second = events.applyOverride(Fixtures.WS, OverrideInput(Fixtures.EVENT_ID, date, OverrideType.Cancel))
        assertEquals(JsonPrimitive("cancel"), second.prior.row?.get("type"))
        assertEquals(1, gateway.rows(SupabaseTables.EVENT_OVERRIDES).size)
        assertEquals(
            "event_id,occurrence_date",
            gateway.callsOf<FakePostgrestGateway.Call.Upsert>().last().onConflict,
        )

        // Undo with no prior deletes the override again.
        events.revertOverride(Fixtures.EVENT_ID, date, first.prior)
        assertEquals(0, gateway.rows(SupabaseTables.EVENT_OVERRIDES).size)
    }

    @Test
    fun `deleteEventDeep snapshots the event and its overrides, then deletes`() = runTest {
        events.applyOverride(Fixtures.WS, OverrideInput(Fixtures.EVENT_ID, Instant.parse("2026-06-02T07:00:00Z"), OverrideType.Cancel))
        val snapshot = events.deleteEventDeep(Fixtures.EVENT_ID)
        assertEquals(1, snapshot.events.size)
        assertEquals(1, snapshot.overrides.size)
        assertEquals(0, gateway.rows(SupabaseTables.EVENTS).size)

        val restored = events.restoreDeleted(snapshot)
        assertEquals(Fixtures.EVENT_ID, restored.events.single().id)
    }

    @Test
    fun `deleteThisAndFuture caps the series one second before the occurrence`() = runTest {
        val series = Fixtures.eventRow(rrule = "FREQ=WEEKLY;BYDAY=MO").decodeAs(PlannerEvent.serializer())
        gateway.tables[SupabaseTables.EVENTS] = mutableListOf(Fixtures.eventRow(rrule = "FREQ=WEEKLY;BYDAY=MO"))

        events.deleteThisAndFuture(series, Instant.parse("2026-06-15T09:00:00Z"))

        val patch = gateway.callsOf<FakePostgrestGateway.Call.Update>().single().patch
        assertEquals(setOf("rrule", "recurrence_ends_at"), patch.keys)
        assertEquals(JsonPrimitive("2026-06-15T08:59:59.000Z"), patch["recurrence_ends_at"])
        assertEquals(JsonPrimitive("FREQ=WEEKLY;BYDAY=MO;UNTIL=20260615T085959Z"), patch["rrule"])
    }

    @Test
    fun `splitSeries caps the original and inserts an open-ended series`() = runTest {
        val row = Fixtures.eventRow(rrule = "FREQ=WEEKLY;BYDAY=MO;COUNT=10")
        gateway.tables[SupabaseTables.EVENTS] = mutableListOf(row)
        val series = row.decodeAs(PlannerEvent.serializer())

        val result = events.splitSeries(
            series,
            Instant.parse("2026-06-15T09:00:00Z"),
            OccurrencePatch(title = "Later standup"),
            newColor = PatchField.Value("#aabbcc"),
        )

        val cap = gateway.callsOf<FakePostgrestGateway.Call.Update>().single()
        assertEquals(setOf("rrule", "recurrence_ends_at"), cap.patch.keys)
        assertEquals(listOf(RowFilter.Eq("id", Fixtures.EVENT_ID)), cap.filters)
        val insert = gateway.callsOf<FakePostgrestGateway.Call.Insert>().single().rows.single()
        assertEquals(21, insert.size)
        assertEquals(JsonPrimitive("Later standup"), insert["title"])
        assertEquals(JsonPrimitive("#aabbcc"), insert["color"])
        assertEquals(JsonPrimitive("2026-06-15T09:00:00.000Z"), insert["starts_at"])
        assertEquals(JsonNull, insert["recurrence_ends_at"])
        assertEquals("Later standup", result.created.title)
        assertEquals(Fixtures.EVENT_ID, result.original?.id)
    }

    @Test
    fun `splitSeries inserts the new series before capping the original`() = runTest {
        val row = Fixtures.eventRow(rrule = "FREQ=WEEKLY;BYDAY=MO")
        gateway.tables[SupabaseTables.EVENTS] = mutableListOf(row)

        events.splitSeries(row.decodeAs(PlannerEvent.serializer()), Instant.parse("2026-06-15T09:00:00Z"), OccurrencePatch())

        val writes = gateway.calls.filter { it is FakePostgrestGateway.Call.Insert || it is FakePostgrestGateway.Call.Update }
        assertEquals(
            listOf(FakePostgrestGateway.Call.Insert::class, FakePostgrestGateway.Call.Update::class),
            writes.map { it::class },
        )
    }

    @Test
    fun `a failed insert leaves the original series untouched`() = runTest {
        val row = Fixtures.eventRow(rrule = "FREQ=WEEKLY;BYDAY=MO")
        gateway.tables[SupabaseTables.EVENTS] = mutableListOf(row)
        val failing = object : PostgrestGateway by gateway {
            override suspend fun insert(table: String, rows: List<JsonObject>): List<JsonObject> = throw IOException("offline")
        }

        assertFailsWith<IOException> {
            EventMutations(failing).splitSeries(
                row.decodeAs(PlannerEvent.serializer()),
                Instant.parse("2026-06-15T09:00:00Z"),
                OccurrencePatch(),
            )
        }

        assertEquals(listOf(row), gateway.rows(SupabaseTables.EVENTS))
        assertTrue(gateway.callsOf<FakePostgrestGateway.Call.Update>().isEmpty())
    }

    @Test
    fun `a failed cap deletes the new series again, then rethrows`() = runTest {
        val row = Fixtures.eventRow(rrule = "FREQ=WEEKLY;BYDAY=MO")
        gateway.tables[SupabaseTables.EVENTS] = mutableListOf(row)
        val failing = object : PostgrestGateway by gateway {
            override suspend fun update(table: String, patch: JsonObject, filters: List<RowFilter>): List<JsonObject> =
                throw IOException("connection reset")
        }

        assertFailsWith<IOException> {
            EventMutations(failing).splitSeries(
                row.decodeAs(PlannerEvent.serializer()),
                Instant.parse("2026-06-15T09:00:00Z"),
                OccurrencePatch(title = "Later standup"),
            )
        }

        // Only the original remains, its rule unchanged.
        assertEquals(listOf(row), gateway.rows(SupabaseTables.EVENTS))
        val created = gateway.callsOf<FakePostgrestGateway.Call.Insert>().single()
        assertEquals(JsonPrimitive("Later standup"), created.rows.single()["title"])
        assertEquals(1, gateway.callsOf<FakePostgrestGateway.Call.Delete>().size)
    }
}
