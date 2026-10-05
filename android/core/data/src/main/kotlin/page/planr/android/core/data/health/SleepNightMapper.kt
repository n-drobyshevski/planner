package page.planr.android.core.data.health

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

/** What a tracker said about a stretch of a sleep session. */
enum class SleepStageKind { Light, Deep, Rem, Sleeping, Awake, Unknown }

data class HealthSleepStage(val start: Instant, val end: Instant, val kind: SleepStageKind)

/** One sleep session as read from Health Connect, free of its SDK types. */
data class HealthSleepSession(
    val id: String,
    val start: Instant,
    val end: Instant,
    /** the zone offset where the session ended; null when the writer didn't record it */
    val endOffset: ZoneOffset?,
    val stages: List<HealthSleepStage> = emptyList(),
)

/**
 * One night for `sleep_logs`, keyed like the web's check-in by its WAKE date.
 * Stage minutes are null when the tracker didn't report that kind of stage;
 * [asleepMin] is null when it reported no stages at all (in bed is not asleep).
 */
data class SleepNight(
    val date: LocalDate,
    val bedtime: Instant,
    val woke: Instant,
    val externalId: String,
    val asleepMin: Int?,
    val deepMin: Int?,
    val lightMin: Int?,
    val remMin: Int?,
    val awakeMin: Int?,
)

/**
 * Health Connect sessions → at most one night per wake date.
 *
 * - Sessions less than [MERGE_GAP] apart are one night (a watch that splits a
 *   night when you get up), the same tolerance as the web's derived nights
 *   (`NIGHT_GAP_TOLERANCE_MS` in lib/sleep/derive.ts). The gap counts as awake.
 * - A night belongs to the local date it ended on, in the zone it ended in.
 * - Nights shorter than [MIN_NIGHT] in bed are naps and are skipped; of two
 *   nights ending the same date, the one with more sleep wins.
 * - Overlapping stages (two writers, or a sloppy one) are counted once.
 */
object SleepNightMapper {
    val MERGE_GAP: Duration = Duration.ofMinutes(45)
    val MIN_NIGHT: Duration = Duration.ofHours(3)

    private const val MAX_MIN = 1440

    fun nights(sessions: List<HealthSleepSession>, zone: ZoneId): List<SleepNight> =
        clusters(sessions.filter { it.end > it.start })
            .map { it.toNight(zone) }
            .filter { Duration.between(it.bedtime, it.woke) >= MIN_NIGHT }
            .groupBy { it.date }
            .map { (_, sameDate) -> sameDate.maxWith(compareBy({ it.sleepMinutes() }, { it.woke })) }
            .sortedBy { it.date }

    private fun clusters(sessions: List<HealthSleepSession>): List<List<HealthSleepSession>> {
        val out = mutableListOf<MutableList<HealthSleepSession>>()
        var end = Instant.MIN
        for (s in sessions.sortedBy { it.start }) {
            if (out.isNotEmpty() && Duration.between(end, s.start) <= MERGE_GAP) {
                out.last().add(s)
            } else {
                out.add(mutableListOf(s))
            }
            if (out.last().size == 1 || s.end > end) end = s.end
        }
        return out
    }

    private fun List<HealthSleepSession>.toNight(zone: ZoneId): SleepNight {
        val start = minOf { it.start }
        val last = maxBy { it.end }
        val end = last.end
        val offset = last.endOffset ?: zone.rules.getOffset(end)
        val date = end.atOffset(offset).toLocalDate()

        val totals = stageTotals()
        val detail = totals?.takeIf { it.detailed }
        return SleepNight(
            date = date,
            bedtime = start,
            woke = end,
            externalId = maxBy { Duration.between(it.start, it.end) }.id,
            asleepMin = totals?.let { minutes(it.asleep) },
            deepMin = detail?.let { minutes(it.deep) },
            lightMin = detail?.let { minutes(it.light) },
            remMin = detail?.let { minutes(it.rem) },
            awakeMin = totals?.let { minutes(it.awake + gaps()) },
        )
    }

    private class Totals {
        var light = 0L
        var deep = 0L
        var rem = 0L
        var sleeping = 0L
        var awake = 0L
        /** any Light/Deep/Rem stage, even a zero-length one after clipping */
        var detailed = false
        val asleep get() = light + deep + rem + sleeping
    }

    /** Stage milliseconds by kind, each instant counted once; null without stages. */
    private fun List<HealthSleepSession>.stageTotals(): Totals? {
        val stages = flatMap { s ->
            s.stages.mapNotNull { st ->
                val from = maxOf(st.start, s.start)
                val to = minOf(st.end, s.end)
                if (to > from && st.kind != SleepStageKind.Unknown) HealthSleepStage(from, to, st.kind) else null
            }
        }.sortedBy { it.start }
        if (stages.isEmpty()) return null
        val t = Totals()
        var cursor = Instant.MIN
        for (st in stages) {
            if (st.kind in DETAIL) t.detailed = true
            val from = maxOf(st.start, cursor)
            if (st.end <= from) continue
            val ms = Duration.between(from, st.end).toMillis()
            when (st.kind) {
                SleepStageKind.Light -> t.light += ms
                SleepStageKind.Deep -> t.deep += ms
                SleepStageKind.Rem -> t.rem += ms
                SleepStageKind.Sleeping -> t.sleeping += ms
                SleepStageKind.Awake -> t.awake += ms
                SleepStageKind.Unknown -> Unit
            }
            cursor = st.end
        }
        return t
    }

    /** Time between the merged sessions of one night (spent awake). */
    private fun List<HealthSleepSession>.gaps(): Long {
        var gap = 0L
        var end: Instant? = null
        for (s in sortedBy { it.start }) {
            if (end != null && s.start > end) gap += Duration.between(end, s.start).toMillis()
            if (end == null || s.end > end) end = s.end
        }
        return gap
    }

    /** Asleep when the tracker staged the night, else time in bed. */
    private fun SleepNight.sleepMinutes(): Long = asleepMin?.toLong() ?: Duration.between(bedtime, woke).toMinutes()

    private val DETAIL = setOf(SleepStageKind.Light, SleepStageKind.Deep, SleepStageKind.Rem)

    private fun minutes(ms: Long): Int = ((ms + 30_000) / 60_000).toInt().coerceIn(0, MAX_MIN)
}
