package page.planr.android.feature.insights.sleep

import kotlinx.datetime.DatePeriod
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.data.model.SleepLog

/** A night's stage minutes, in the bar's order (stages-section.tsx `STAGES`). */
data class SleepStageMinutes(val deep: Int, val light: Int, val rem: Int, val awake: Int) {
    val total: Int get() = deep + light + rem + awake
}

/** One row of the Sleep tab: a night, keyed by its wake date. */
data class SleepNightRow(
    val date: LocalDate,
    /** wall clock in the viewer's zone, to the minute; null when not recorded */
    val bedtime: LocalTime?,
    val wake: LocalTime?,
    /** bedtime to wake, whole minutes; null without both times */
    val inBedMin: Int?,
    /** device-reported time asleep (time in bed is not time asleep) */
    val asleepMin: Int?,
    val quality: Int?,
    val fatigue: Int?,
    val fromHealthConnect: Boolean,
    /** null when the device reported no stages */
    val stages: SleepStageMinutes?,
)

/** The viewer's recent nights, newest first. */
data class SleepNightsModel(val nights: List<SleepNightRow>) {
    val isEmpty: Boolean get() = nights.isEmpty()

    /** Any night with stages: the stage legend shows. */
    val hasStages: Boolean get() = nights.any { it.stages != null }
}

/** Builds the Sleep tab from the member's [SleepLog]s (pure; see the tests). */
object SleepNightsModelBuilder {
    /** The nights listed: today's and the 13 before it. */
    const val NIGHTS = 14

    fun build(logs: List<SleepLog>, today: LocalDate, zone: TimeZone): SleepNightsModel {
        val first = today.minus(DatePeriod(days = NIGHTS - 1))
        val rows = logs
            .filter { it.date in first..today }
            .sortedByDescending { it.date }
            .map { row(it, zone) }
        return SleepNightsModel(rows)
    }

    private fun row(log: SleepLog, zone: TimeZone): SleepNightRow {
        val bed = log.bedtimeAt
        val woke = log.wokeAt
        val inBed = if (bed != null && woke != null && woke > bed) (woke - bed).inWholeMinutes.toInt() else null
        return SleepNightRow(
            date = log.date,
            bedtime = bed?.toLocalDateTime(zone)?.time?.let { LocalTime(it.hour, it.minute) },
            wake = woke?.toLocalDateTime(zone)?.time?.let { LocalTime(it.hour, it.minute) },
            inBedMin = inBed,
            asleepMin = log.asleepMin,
            quality = log.quality,
            fatigue = log.fatigue,
            fromHealthConnect = log.fromHealthConnect,
            stages = if (log.hasStages) {
                SleepStageMinutes(
                    deep = log.deepMin ?: 0,
                    light = log.lightMin ?: 0,
                    rem = log.remMin ?: 0,
                    awake = log.awakeMin ?: 0,
                )
            } else {
                null
            },
        )
    }
}
