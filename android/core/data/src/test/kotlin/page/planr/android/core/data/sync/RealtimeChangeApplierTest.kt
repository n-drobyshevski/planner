package page.planr.android.core.data.sync

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import page.planr.android.core.data.local.CacheGate
import page.planr.android.core.data.local.PlanrDatabase
import page.planr.android.core.data.local.entity.toModel
import page.planr.android.core.data.remote.Fixtures
import page.planr.android.core.data.remote.SupabaseTables

/** Realtime echoes into a real (in-memory) Room: out-of-order rows never revert newer ones. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class RealtimeChangeApplierTest {
    private lateinit var db: PlanrDatabase
    private lateinit var applier: RealtimeChangeApplier

    @BeforeTest
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), PlanrDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        applier = RealtimeChangeApplier(db, CacheGate())
    }

    @AfterTest
    fun tearDown() = db.close()

    private fun JsonObject.with(column: String, value: String) = JsonObject(this + (column to JsonPrimitive(value)))

    private val earlier = "2026-05-20T08:15:30.123456+00:00"
    private val later = "2026-05-20T08:15:31.000001+00:00"

    @Test
    fun `an event echo older than the cached row is skipped`() = runTest {
        assertTrue(applier.apply(SupabaseTables.EVENTS, RowChange.Upsert(Fixtures.eventRow(updatedAt = later).with("title", "New"))))

        val applied = applier.apply(SupabaseTables.EVENTS, RowChange.Upsert(Fixtures.eventRow(updatedAt = earlier).with("title", "Old")))

        assertFalse(applied)
        assertEquals("New", db.eventDao().getById(Fixtures.EVENT_ID)?.toModel()?.title)
    }

    @Test
    fun `a newer or equally new event row is applied`() = runTest {
        applier.apply(SupabaseTables.EVENTS, RowChange.Upsert(Fixtures.eventRow(updatedAt = earlier).with("title", "First")))

        assertTrue(applier.apply(SupabaseTables.EVENTS, RowChange.Upsert(Fixtures.eventRow(updatedAt = earlier).with("title", "Same"))))
        assertEquals("Same", db.eventDao().getById(Fixtures.EVENT_ID)?.toModel()?.title)

        assertTrue(applier.apply(SupabaseTables.EVENTS, RowChange.Upsert(Fixtures.eventRow(updatedAt = later).with("title", "Later"))))
        assertEquals("Later", db.eventDao().getById(Fixtures.EVENT_ID)?.toModel()?.title)
    }

    @Test
    fun `a task echo older than the cached row is skipped`() = runTest {
        applier.apply(SupabaseTables.TASKS, RowChange.Upsert(Fixtures.taskRow(updatedAt = later).with("title", "New")))

        assertFalse(applier.apply(SupabaseTables.TASKS, RowChange.Upsert(Fixtures.taskRow(updatedAt = earlier).with("title", "Old"))))
        assertEquals("New", db.taskDao().getById(Fixtures.TASK_ID)?.toModel()?.title)
    }

    @Test
    fun `isOutdated only skips a row known to be older`() {
        val t = Instant.parse("2026-05-20T08:15:30.123456Z")
        assertTrue(RealtimeChangeApplier.isOutdated(incoming = t, cached = Instant.parse("2026-05-20T08:15:30.123457Z")))
        assertFalse(RealtimeChangeApplier.isOutdated(incoming = t, cached = t))
        assertFalse(RealtimeChangeApplier.isOutdated(incoming = Instant.parse("2026-05-20T08:15:31Z"), cached = t))
        // No updated_at on the incoming row, or nothing cached: apply.
        assertFalse(RealtimeChangeApplier.isOutdated(incoming = null, cached = t))
        assertFalse(RealtimeChangeApplier.isOutdated(incoming = t, cached = null))
    }
}
