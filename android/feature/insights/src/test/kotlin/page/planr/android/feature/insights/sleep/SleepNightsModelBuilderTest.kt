package page.planr.android.feature.insights.sleep

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import page.planr.android.core.data.model.SleepLog
import page.planr.android.core.data.model.SleepTimesSource

class SleepNightsModelBuilderTest {
    private val berlin = TimeZone.of("Europe/Berlin")
    private val today = LocalDate(2026, 10, 6)

    private fun night(day: Int, month: Int = 10) = SleepLog(date = LocalDate(2026, month, day))

    @Test
    fun `lists the last 14 nights, newest first`() {
        val logs = listOf(night(22, 9), night(23, 9), night(6), night(1), night(7))

        val model = SleepNightsModelBuilder.build(logs, today, berlin)

        // 23 Sep is the 14th night back; 22 Sep and tomorrow's are left out.
        assertEquals(listOf(night(6).date, night(1).date, night(23, 9).date), model.nights.map { it.date })
    }

    @Test
    fun `a device night carries its times, duration, stages and source`() {
        val log = SleepLog(
            date = today,
            bedtimeAt = Instant.parse("2026-10-05T21:40:59Z"),
            wokeAt = Instant.parse("2026-10-06T05:10:00Z"),
            timesSource = SleepTimesSource.HealthConnect,
            asleepMin = 410,
            deepMin = 80,
            lightMin = 240,
            remMin = 90,
            awakeMin = null,
        )

        val row = SleepNightsModelBuilder.build(listOf(log), today, berlin).nights.single()

        assertEquals(LocalTime(23, 40), row.bedtime)
        assertEquals(LocalTime(7, 10), row.wake)
        assertEquals(449, row.inBedMin)
        assertEquals(410, row.asleepMin)
        assertTrue(row.fromHealthConnect)
        assertEquals(SleepStageMinutes(deep = 80, light = 240, rem = 90, awake = 0), row.stages)
        assertEquals(410, row.stages?.total)
        assertNull(row.quality)
    }

    @Test
    fun `a rated night without times or stages still lists`() {
        val model = SleepNightsModelBuilder.build(listOf(night(5).copy(quality = 6, fatigue = 3)), today, berlin)

        val row = model.nights.single()
        assertEquals(6, row.quality)
        assertEquals(3, row.fatigue)
        assertNull(row.bedtime)
        assertNull(row.inBedMin)
        assertNull(row.stages)
        assertFalse(row.fromHealthConnect)
        assertFalse(model.hasStages)
    }

    @Test
    fun `only a bedtime is no duration`() {
        val log = night(5).copy(bedtimeAt = Instant.parse("2026-10-04T21:00:00Z"))

        val row = SleepNightsModelBuilder.build(listOf(log), today, berlin).nights.single()

        assertEquals(LocalTime(23, 0), row.bedtime)
        assertNull(row.wake)
        assertNull(row.inBedMin)
    }

    @Test
    fun `no nights is the empty state`() {
        assertTrue(SleepNightsModelBuilder.build(emptyList(), today, berlin).isEmpty)
    }
}
