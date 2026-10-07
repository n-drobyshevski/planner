package page.planr.android.core.data.local

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import page.planr.android.core.data.local.entity.toEntity
import page.planr.android.core.data.local.entity.toModel
import page.planr.android.core.data.remote.Fixtures
import page.planr.android.core.data.remote.decodeAs
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.Task

/** The Room payload keeps `updated_by` (no Room migration: the payload is the whole row). */
class EntityRoundTripTest {

    private fun JsonObject.editedBy(member: String) = JsonObject(this + ("updated_by" to JsonPrimitive(member)))

    @Test
    fun `an event keeps who last edited it through the cache`() {
        val event = Fixtures.eventRow().editedBy(PARTNER).decodeAs(PlannerEvent.serializer())

        val cached = event.toEntity().toModel()

        assertEquals(PARTNER, cached.updatedBy)
        assertEquals(event, cached)
    }

    @Test
    fun `a task keeps who last edited it through the cache`() {
        val task = Fixtures.taskRow().editedBy(PARTNER).decodeAs(Task.serializer())

        val cached = task.toEntity().toModel()

        assertEquals(PARTNER, cached.updatedBy)
        assertEquals(task, cached)
    }

    @Test
    fun `rows cached before the column existed read back as unknown editor`() {
        val legacyPayload = Fixtures.taskRow().toString()

        val cached = Fixtures.taskRow().decodeAs(Task.serializer()).toEntity().copy(payload = legacyPayload).toModel()

        assertNull(cached.updatedBy)
    }

    private companion object {
        const val PARTNER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    }
}
