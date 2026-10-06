package page.planr.android.core.data.health

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import page.planr.android.core.data.health.SleepStageKind.Awake
import page.planr.android.core.data.health.SleepStageKind.Deep
import page.planr.android.core.data.health.SleepStageKind.Light
import page.planr.android.core.data.health.SleepStageKind.Rem
import page.planr.android.core.data.health.SleepStageKind.Sleeping

class SleepNightMapperTest {
    private val berlin = ZoneId.of("Europe/Berlin")
    private val plus2 = ZoneOffset.ofHours(2)

    /** An instant on [day] (October 2026) at [hhmm] in UTC+2. */
    private fun at(day: Int, hhmm: String): Instant {
        val (h, m) = hhmm.split(":").map(String::toInt)
        return LocalDate.of(2026, 10, day).atTime(h, m).toInstant(plus2)
    }

    private fun session(
        id: String,
        start: Instant,
        end: Instant,
        offset: ZoneOffset? = plus2,
        stages: List<HealthSleepStage> = emptyList(),
    ) = HealthSleepSession(id, start, end, offset, stages)

    private fun stage(from: Instant, to: Instant, kind: SleepStageKind) = HealthSleepStage(from, to, kind)

    @Test
    fun `a night belongs to the date it ended on, in the zone it ended in`() {
        val night = SleepNightMapper.nights(listOf(session("a", at(4, "23:30"), at(5, "07:10"))), berlin).single()

        assertEquals(LocalDate.of(2026, 10, 5), night.date)
        assertEquals(at(4, "23:30"), night.bedtime)
        assertEquals(at(5, "07:10"), night.woke)
        assertEquals("a", night.externalId)
        // No stages: no claim about time asleep.
        assertNull(night.asleepMin)
        assertNull(night.deepMin)
        assertNull(night.awakeMin)
    }

    @Test
    fun `without a recorded offset the device zone decides the date`() {
        // 23:30 UTC on the 4th is 01:30 on the 5th in Berlin (UTC+2).
        val end = LocalDate.of(2026, 10, 4).atTime(23, 30).toInstant(ZoneOffset.UTC)
        val night = SleepNightMapper.nights(listOf(session("a", end.minusSeconds(8 * 3600), end, offset = null)), berlin)
            .single()
        assertEquals(LocalDate.of(2026, 10, 5), night.date)
    }

    @Test
    fun `sessions split by a short wake-up are one night, the gap counted awake`() {
        val nights = SleepNightMapper.nights(
            listOf(
                session("first", at(4, "23:00"), at(5, "03:00"), stages = listOf(stage(at(4, "23:00"), at(5, "03:00"), Light))),
                session("second", at(5, "03:30"), at(5, "06:30"), stages = listOf(stage(at(5, "03:30"), at(5, "06:30"), Deep))),
            ),
            berlin,
        )
        val night = nights.single()
        assertEquals(at(4, "23:00"), night.bedtime)
        assertEquals(at(5, "06:30"), night.woke)
        assertEquals("first", night.externalId)
        assertEquals(240, night.lightMin)
        assertEquals(180, night.deepMin)
        assertEquals(0, night.remMin)
        assertEquals(420, night.asleepMin)
        assertEquals(30, night.awakeMin)
    }

    @Test
    fun `a long gap splits off a nap, which is dropped`() {
        val nights = SleepNightMapper.nights(
            listOf(
                session("night", at(4, "23:00"), at(5, "07:00")),
                session("nap", at(5, "14:00"), at(5, "15:00")),
            ),
            berlin,
        )
        assertEquals(listOf("night"), nights.map { it.externalId })
    }

    @Test
    fun `of two nights ending the same date, the one with more sleep wins`() {
        val nights = SleepNightMapper.nights(
            listOf(
                session("early", at(5, "00:00"), at(5, "04:00"), stages = listOf(stage(at(5, "00:00"), at(5, "04:00"), Awake))),
                session("late", at(5, "06:00"), at(5, "10:00"), stages = listOf(stage(at(5, "06:00"), at(5, "10:00"), Sleeping))),
            ),
            berlin,
        )
        val night = nights.single()
        assertEquals("late", night.externalId)
        assertEquals(240, night.asleepMin)
        // Only "sleeping" stages: the tracker didn't split light / deep / REM.
        assertNull(night.deepMin)
        assertNull(night.lightMin)
        assertNull(night.remMin)
        assertEquals(0, night.awakeMin)
    }

    @Test
    fun `overlapping stages count once and stages outside the session are clipped`() {
        val night = SleepNightMapper.nights(
            listOf(
                session(
                    "a",
                    at(4, "23:00"),
                    at(5, "07:00"),
                    stages = listOf(
                        stage(at(4, "22:00"), at(5, "01:00"), Light), // starts before bed
                        stage(at(5, "00:30"), at(5, "03:00"), Deep), // overlaps light by 30 min
                        stage(at(5, "03:00"), at(5, "04:30"), Rem),
                        stage(at(5, "04:30"), at(5, "04:50"), Awake),
                        stage(at(5, "04:50"), at(5, "08:00"), Light), // ends after waking
                    ),
                ),
            ),
            berlin,
        ).single()
        assertEquals(120 + 130, night.lightMin)
        assertEquals(120, night.deepMin)
        assertEquals(90, night.remMin)
        assertEquals(20, night.awakeMin)
        assertEquals(460, night.asleepMin)
    }

    @Test
    fun `a night across the DST change keeps its real length`() {
        // Berlin leaves summer time at 03:00 on 25 October 2026.
        val bed = LocalDate.of(2026, 10, 24).atTime(23, 0).atZone(berlin).toInstant()
        val wake = LocalDate.of(2026, 10, 25).atTime(7, 0).atZone(berlin).toInstant()
        val night = SleepNightMapper.nights(
            listOf(session("a", bed, wake, offset = ZoneOffset.ofHours(1), stages = listOf(stage(bed, wake, Light)))),
            berlin,
        ).single()
        assertEquals(LocalDate.of(2026, 10, 25), night.date)
        assertEquals(9 * 60, night.lightMin)
    }
}
