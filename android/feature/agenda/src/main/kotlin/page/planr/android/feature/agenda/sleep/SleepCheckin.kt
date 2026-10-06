package page.planr.android.feature.agenda.sleep

import kotlin.time.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.data.model.SleepLog
import page.planr.android.core.data.model.SleepRatingForm
import page.planr.android.core.design.component.SleepRatingDraft

/**
 * The agenda's morning card: last night (woke [date]), with the times the
 * tracker recorded when there are any.
 */
data class SleepCheckinCard(val date: LocalDate, val bedtime: LocalTime? = null, val wake: LocalTime? = null)

/** The rating sheet over the agenda. */
data class SleepCheckinSheet(
    val form: SleepRatingForm,
    val saving: Boolean = false,
    /** the last save failed; the sheet stays open to retry */
    val failed: Boolean = false,
)

data class SleepCheckinUiState(val card: SleepCheckinCard? = null, val sheet: SleepCheckinSheet? = null)

/** When the morning check-in asks (checkin-card.tsx, sleep-tab.tsx). */
object SleepCheckinRules {
    /** Local hours the card may show: from the small hours' end until the evening. */
    const val FROM_HOUR = 4
    const val UNTIL_HOUR = 18

    /**
     * The card for [now] in [zone], or null: outside [FROM_HOUR]–[UNTIL_HOUR],
     * before the nights are loaded ([logs] null), once today's night is rated
     * (`isRatedLog`), or when it was dismissed today. A night with no row at
     * all still asks: that is a manual check-in.
     */
    fun card(now: Instant, zone: TimeZone, logs: List<SleepLog>?, dismissedOn: LocalDate?): SleepCheckinCard? {
        if (logs == null) return null
        val local = now.toLocalDateTime(zone)
        if (local.hour !in FROM_HOUR until UNTIL_HOUR) return null
        val today = local.date
        if (dismissedOn == today) return null
        val log = logs.firstOrNull { it.date == today }
        if (log?.isRated == true) return null
        val bed = log?.bedtimeAt
        val woke = log?.wokeAt
        return if (bed != null && woke != null) {
            SleepCheckinCard(today, bed.toLocalDateTime(zone).time.atMinute(), woke.toLocalDateTime(zone).time.atMinute())
        } else {
            SleepCheckinCard(today)
        }
    }

    private fun LocalTime.atMinute(): LocalTime = LocalTime(hour, minute)
}

/** The sheet's values for the shared [SleepRatingDraft] (minutes after midnight). */
internal fun SleepRatingForm.toDraft(): SleepRatingDraft = SleepRatingDraft(
    bedtimeMinutes = bedtime.hour * 60 + bedtime.minute,
    wakeMinutes = wake.hour * 60 + wake.minute,
    quality = quality,
    fatigue = fatigue,
    note = note,
    timesEdited = timesEdited,
)

internal fun SleepRatingForm.with(draft: SleepRatingDraft): SleepRatingForm = copy(
    bedtime = LocalTime(draft.bedtimeMinutes / 60, draft.bedtimeMinutes % 60),
    wake = LocalTime(draft.wakeMinutes / 60, draft.wakeMinutes % 60),
    quality = draft.quality,
    fatigue = draft.fatigue,
    note = draft.note,
    timesEdited = draft.timesEdited,
)
