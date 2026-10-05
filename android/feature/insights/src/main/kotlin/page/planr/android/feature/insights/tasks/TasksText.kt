package page.planr.android.feature.insights.tasks

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import page.planr.android.core.insights.js.JsMath
import page.planr.android.core.insights.labels.DurationFormat
import page.planr.android.core.insights.labels.LabelLocale
import page.planr.android.core.insights.model.ComparisonUnit
import page.planr.android.core.insights.model.Granularity
import page.planr.android.core.insights.model.LeadTime
import page.planr.android.core.insights.model.LedeArg
import page.planr.android.core.insights.model.LedeLine
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.model.UiText
import page.planr.android.feature.insights.model.resolve
import page.planr.android.feature.insights.ui.components.rememberLabelLocale

/**
 * The Tasks tab's strings: the lede mapping, the lead-time figure and the
 * per-granularity resource picks (the web's ICU selects, one Android string per
 * branch). Pure, so a JVM test can check every branch against the resources
 * without a Context.
 */
internal object TasksText {

    /** The figure shown for a missing value (tasks-tab.tsx). */
    const val NONE = "—"

    /**
     * A Tasks lede line (ledes.ts `deriveTasksLede`) as a resource with its
     * args. The done headline is a plural frame (`lede_done`) plus a comparison
     * clause (`lede_<more|fewer>_<unit>`), or "" when the direction is "level".
     */
    fun ledeSpec(line: LedeLine): UiText {
        val args = line.args
        fun count(name: String): Int = (args.getValue(name) as LedeArg.Num).value.toInt()
        fun select(name: String): String = (args.getValue(name) as LedeArg.Select).token

        return when (line.key) {
            "lede.tasksOverdueHeadline" -> UiText.Plural(R.plurals.insights_tasks_lede_overdue, count("count"))
            "lede.tasksDoneSupport" -> UiText.Plural(R.plurals.insights_tasks_lede_done_support, count("count"))
            "lede.tasksAdherenceSupport" -> UiText.Res(R.string.insights_tasks_lede_adherence, listOf(count("pct")))
            "lede.tasksDoneHeadline" -> {
                val unit = checkNotNull(ComparisonUnit.entries.firstOrNull { it.id == select("unit") }) { "unit" }
                val clause = when (val direction = select("direction")) {
                    "level" -> UiText.Raw("")
                    "more" -> UiText.Res(moreClause(unit), listOf(count("diff")))
                    "fewer" -> UiText.Res(fewerClause(unit), listOf(count("diff")))
                    else -> error("lede.tasksDoneHeadline: unknown direction \"$direction\"")
                }
                val done = count("count")
                UiText.Plural(R.plurals.insights_tasks_lede_done, done, listOf(done, clause))
            }
            else -> error("Not a Tasks lede key: ${line.key}")
        }
    }

    @StringRes
    fun moreClause(unit: ComparisonUnit): Int = when (unit) {
        ComparisonUnit.Week -> R.string.insights_tasks_lede_more_week
        ComparisonUnit.Month -> R.string.insights_tasks_lede_more_month
        ComparisonUnit.Period -> R.string.insights_tasks_lede_more_period
    }

    @StringRes
    fun fewerClause(unit: ComparisonUnit): Int = when (unit) {
        ComparisonUnit.Week -> R.string.insights_tasks_lede_fewer_week
        ComparisonUnit.Month -> R.string.insights_tasks_lede_fewer_month
        ComparisonUnit.Period -> R.string.insights_tasks_lede_fewer_period
    }

    /**
     * tasks-tab.tsx `formatLeadTime`: a duration under two days, else days
     * with the hours when there are any ("2d 24h" included, as on the web).
     */
    fun leadTimeSpec(lead: LeadTime?, locale: LabelLocale): UiText = when (lead) {
        null -> UiText.Raw(NONE)
        is LeadTime.Short -> UiText.Raw(DurationFormat.format(lead.ms, locale))
        is LeadTime.DaysHours -> if (lead.hours > 0) {
            UiText.Res(R.string.insights_tasks_lead_days_hours, listOf(lead.days, lead.hours))
        } else {
            UiText.Res(R.string.insights_tasks_lead_days, listOf(lead.days))
        }
    }

    /** "42%" for a rate, "—" without one (`Math.round(rate * 100)`). */
    fun percent(rate: Double?): String = rate?.let { "${JsMath.roundToInt(it * 100)}%" } ?: NONE

    /** The On time figure's hint: "of N due", or "nothing due". */
    fun onTimeHint(dueCount: Int): UiText =
        if (dueCount > 0) UiText.Res(R.string.insights_tasks_on_time_due, listOf(dueCount))
        else UiText.Res(R.string.insights_tasks_on_time_nothing)

    /** tasks.velocity. */
    @StringRes
    fun velocityTitle(g: Granularity): Int = when (g) {
        Granularity.Day -> R.string.insights_tasks_velocity_day
        Granularity.Week -> R.string.insights_tasks_velocity_week
        Granularity.Month -> R.string.insights_tasks_velocity_month
    }

    /** tasks.velocityAria: the period label. */
    @StringRes
    fun velocityAria(g: Granularity): Int = when (g) {
        Granularity.Day -> R.string.insights_tasks_velocity_aria_day
        Granularity.Week -> R.string.insights_tasks_velocity_aria_week
        Granularity.Month -> R.string.insights_tasks_velocity_aria_month
    }
}

/** A Tasks lede line in the current locale. */
@Composable
internal fun ledeText(line: LedeLine): String = remember(line) { TasksText.ledeSpec(line) }.resolve()

/** The lead-time figure in the current locale. */
@Composable
internal fun leadTimeText(lead: LeadTime?): String {
    val locale = rememberLabelLocale()
    return remember(lead, locale) { TasksText.leadTimeSpec(lead, locale) }.resolve()
}
