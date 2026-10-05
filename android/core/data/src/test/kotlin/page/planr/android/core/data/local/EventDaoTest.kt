package page.planr.android.core.data.local

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Instant
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import page.planr.android.core.data.local.entity.toEntity
import page.planr.android.core.data.local.entity.toModel
import page.planr.android.core.data.remote.Fixtures
import page.planr.android.core.data.remote.SupabaseTables
import page.planr.android.core.data.remote.decodeAs
import page.planr.android.core.data.sync.RealtimeChangeApplier
import page.planr.android.core.data.sync.RowChange
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.OverrideType
import page.planr.android.core.model.PlannerEvent

/** The Room window query must select exactly what `fetchWindow` would. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class EventDaoTest {
    private lateinit var db: PlanrDatabase

    private val start = Instant.parse("2026-06-01T00:00:00Z").toEpochMilliseconds()
    private val end = Instant.parse("2026-06-08T00:00:00Z").toEpochMilliseconds()

    @BeforeTest
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), PlanrDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @AfterTest
    fun tearDown() = db.close()

    private fun event(
        id: String,
        start: String,
        end: String,
        rrule: String? = null,
        recurrenceEndsAt: String? = null,
    ) = Fixtures.eventRow(id = id, start = start, end = end, rrule = rrule, recurrenceEndsAt = recurrenceEndsAt)
        .decodeAs(PlannerEvent.serializer())

    @Test
    fun `window query mirrors fetchWindow's predicate`() = runTest {
        db.eventDao().upsertEvents(
            listOf(
                event("inside", "2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z"),
                event("ends-at-start", "2026-05-31T23:00:00Z", "2026-06-01T00:00:00Z"),
                event("past", "2026-05-01T09:00:00Z", "2026-05-01T10:00:00Z"),
                event("starts-at-end", "2026-06-08T00:00:00Z", "2026-06-08T01:00:00Z"),
                event("open-series", "2026-01-05T09:00:00Z", "2026-01-05T10:00:00Z", rrule = "FREQ=WEEKLY"),
                event("ended-series", "2026-01-05T09:00:00Z", "2026-01-05T10:00:00Z", "FREQ=DAILY", "2026-01-07T09:00:00Z"),
            ).map { it.toEntity() },
        )
        val ids = db.eventDao().observeWindow(Fixtures.WS, start, end).first().map { it.id }.toSet()
        // `ends_at >= start` keeps an event ending exactly at the window start (as the web does).
        assertEquals(setOf("inside", "ends-at-start", "open-series"), ids)
    }

    @Test
    fun `overrides follow their events into the window`() = runTest {
        db.eventDao().upsertEvents(
            listOf(
                event("series", "2026-01-05T09:00:00Z", "2026-01-05T10:00:00Z", rrule = "FREQ=WEEKLY"),
                event("past", "2026-05-01T09:00:00Z", "2026-05-01T10:00:00Z"),
            ).map { it.toEntity() },
        )
        db.eventDao().upsertOverrides(
            listOf(override("o1", "series"), override("o2", "past")).map { it.toEntity() },
        )
        val overrides = db.eventDao().observeOverridesInWindow(Fixtures.WS, start, end).first()
        assertEquals(listOf("o1"), overrides.map { it.id })
    }

    @Test
    fun `realtime changes upsert and delete rows`() = runTest {
        val applier = RealtimeChangeApplier(db, CacheGate())
        applier.apply(SupabaseTables.EVENTS, RowChange.Upsert(Fixtures.eventRow()))
        applier.apply(
            SupabaseTables.EVENT_OVERRIDES,
            RowChange.Upsert(
                Fixtures.row(
                    """{"id":"o1","workspace_id":"${Fixtures.WS}","event_id":"${Fixtures.EVENT_ID}",
                    "occurrence_date":"2026-06-01 09:00:00+00","type":"cancel"}""",
                ),
            ),
        )
        assertEquals("Standup", db.eventDao().getById(Fixtures.EVENT_ID)?.toModel()?.title)
        assertEquals(1, db.eventDao().observeOverridesFor(Fixtures.EVENT_ID).first().size)

        // DELETE payloads carry only the primary key; the event's overrides go too.
        applier.apply(SupabaseTables.EVENTS, RowChange.Delete(Fixtures.row("""{"id":"${Fixtures.EVENT_ID}"}""")))
        assertEquals(null, db.eventDao().getById(Fixtures.EVENT_ID))
        assertEquals(0, db.eventDao().observeOverridesFor(Fixtures.EVENT_ID).first().size)
    }

    @Test
    fun `deleting a task removes its subtree and linked blocks`() = runTest {
        val applier = RealtimeChangeApplier(db, CacheGate())
        applier.apply(SupabaseTables.TASKS, RowChange.Upsert(Fixtures.taskRow(id = "parent")))
        val child = JsonObject(Fixtures.taskRow(id = "child") + ("parent_id" to JsonPrimitive("parent")))
        applier.apply(SupabaseTables.TASKS, RowChange.Upsert(child))
        val block = JsonObject(Fixtures.eventRow(id = "block") + ("task_id" to JsonPrimitive("child")))
        applier.apply(SupabaseTables.EVENTS, RowChange.Upsert(block))

        applier.apply(SupabaseTables.TASKS, RowChange.Delete(Fixtures.row("""{"id":"parent"}""")))

        assertEquals(emptyList(), db.taskDao().observeAll(Fixtures.WS).first())
        assertEquals(null, db.eventDao().getById("block"))
    }

    @Test
    fun `an override re-created under a new id replaces the cached one`() = runTest {
        db.eventDao().upsertEvents(
            listOf(event("series", "2026-01-05T09:00:00Z", "2026-01-05T10:00:00Z", rrule = "FREQ=WEEKLY").toEntity()),
        )
        db.eventDao().upsertOverrides(listOf(override("old", "series").toEntity()))
        // Deleted elsewhere (we never heard), then the same occurrence edited again.
        db.eventDao().upsertOverrides(listOf(override("new", "series", type = "modify").toEntity()))

        val cached = db.eventDao().observeOverridesFor("series").first()
        assertEquals(listOf("new"), cached.map { it.id })
        assertEquals(OverrideType.Modify, cached.single().toModel().type)
    }

    private fun override(id: String, eventId: String, type: String = "cancel") = Fixtures.row(
        """{"id":"$id","workspace_id":"${Fixtures.WS}","event_id":"$eventId",
        "occurrence_date":"2026-06-02T09:00:00+00:00","type":"$type"}""",
    ).decodeAs(EventOverride.serializer())
}
