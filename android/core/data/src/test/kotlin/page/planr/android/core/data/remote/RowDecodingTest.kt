package page.planr.android.core.data.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import page.planr.android.core.data.local.entity.toEntity
import page.planr.android.core.data.local.entity.toModel
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.Task

/** Real column names in, :core:model types out, and a lossless trip through Room. */
class RowDecodingTest {

    @Test
    fun `event row decodes and round-trips through its entity`() {
        val event = Fixtures.eventRow(rrule = "FREQ=WEEKLY;BYDAY=MO").decodeAs(PlannerEvent.serializer())
        assertEquals(Instant.parse("2026-06-01T09:00:00Z"), event.start)
        assertEquals(Instant.parse("2026-05-20T08:15:30.123456Z"), event.updatedAt)
        assertEquals("Europe/Berlin", event.timeZone)

        val entity = event.toEntity()
        assertEquals(true, entity.isRecurring)
        assertEquals(event.start.toEpochMilliseconds(), entity.startsAt)
        assertEquals(event, entity.toModel())
    }

    @Test
    fun `realtime payloads with postgres text timestamps decode too`() {
        val override = Fixtures.row(
            """
            {"id":"o1","workspace_id":"${Fixtures.WS}","event_id":"e1",
             "occurrence_date":"2026-06-02 07:00:00+00","type":"modify","title":"Moved",
             "starts_at":"2026-06-02 08:00:00+00","ends_at":null,"all_day":null}
            """,
        ).decodeAs(EventOverride.serializer())
        assertEquals(Instant.parse("2026-06-02T07:00:00Z"), override.occurrenceDate)
        assertEquals(override, override.toEntity().toModel())
    }

    @Test
    fun `task row decodes dates and round-trips`() {
        val task = Fixtures.taskRow().decodeAs(Task.serializer())
        assertEquals(LocalDate(2026, 6, 3), task.dueDate)
        assertEquals(1.5, task.position)
        val entity = task.toEntity()
        assertEquals("2026-06-03", entity.dueDate)
        assertEquals(task, entity.toModel())
    }
}
