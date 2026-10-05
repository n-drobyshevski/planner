package page.planr.android.feature.agenda.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringArrayResource
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.recurrence.Freq
import page.planr.android.core.recurrence.RecurrenceEnd
import page.planr.android.core.recurrence.RecurrenceForm
import page.planr.android.feature.agenda.R

/**
 * "Repeats weekly on Mon, Wed, until 30 Jun 2026" — port of
 * `summarizeRecurrence` in lib/recurrence/rrule-build.ts. Branching mirrors
 * `RRuleBuild.buildRRule` exactly (a daily weekday filter has no interval).
 */
@Composable
internal fun recurrenceSummary(form: RecurrenceForm, formats: AgendaFormats, zone: TimeZone): String {
    val res = LocalResources.current
    val weekdays = stringArrayResource(R.array.agenda_weekday_short)
    val hasDays = (form.freq == Freq.WEEKLY || form.freq == Freq.DAILY) && form.byWeekday.isNotEmpty()
    val showInterval = form.interval > 1 && !(form.freq == Freq.DAILY && hasDays)

    var out = if (showInterval) {
        val plural = when (form.freq) {
            Freq.DAILY -> R.plurals.agenda_summary_every_day
            Freq.WEEKLY -> R.plurals.agenda_summary_every_week
            Freq.MONTHLY -> R.plurals.agenda_summary_every_month
        }
        res.getQuantityString(plural, form.interval, form.interval)
    } else {
        res.getString(
            when (form.freq) {
                Freq.DAILY -> R.string.agenda_summary_daily
                Freq.WEEKLY -> R.string.agenda_summary_weekly
                Freq.MONTHLY -> R.string.agenda_summary_monthly
            },
        )
    }
    if (hasDays) {
        val days = form.byWeekday.sortedBy { it.ordinal }.joinToString(res.getString(R.string.agenda_summary_day_separator)) {
            weekdays[it.ordinal]
        }
        out = res.getString(R.string.agenda_summary_on_days, out, days)
    }
    when (val end = form.end) {
        is RecurrenceEnd.Until ->
            out = res.getString(R.string.agenda_summary_until, out, formats.date(end.date.toLocalDateTime(zone).date))
        is RecurrenceEnd.Count ->
            out = res.getQuantityString(R.plurals.agenda_summary_times, end.count, out, end.count)
        RecurrenceEnd.Never -> Unit
    }
    return out
}
