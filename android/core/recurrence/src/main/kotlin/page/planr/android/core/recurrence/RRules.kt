package page.planr.android.core.recurrence

import page.planr.android.core.recurrence.rrule.Frequency
import page.planr.android.core.recurrence.rrule.RRuleOptions
import page.planr.android.core.recurrence.rrule.RRuleSpec

/** Checks on bare RRULE strings, for rules that come from outside Planr (an .ics import). */
object RRules {

    /** The frequencies Planr expands: sub-daily rules are not supported. */
    private val SUPPORTED = setOf(Frequency.YEARLY, Frequency.MONTHLY, Frequency.WEEKLY, Frequency.DAILY)

    /**
     * Whether [rrule] (bare, e.g. `FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130T225959Z`)
     * is a rule Planr can expand: it parses like rrule.js `RRule.parseString`,
     * builds like `new RRule(…)`, and its FREQ is YEARLY, MONTHLY, WEEKLY or
     * DAILY. Unknown keys and malformed values make it invalid.
     *
     * Slightly stricter than the web's `RRule.parseString`, which keeps a
     * non-numeric COUNT or a lowercase weekday as is (see [RRuleOptions]).
     */
    fun isValid(rrule: String): Boolean {
        if (rrule.isBlank()) return false
        return try {
            val options = RRuleOptions.parse(rrule)
            val freq = options.freq ?: return false
            if (freq !in SUPPORTED || options.byeaster != null) return false
            RRuleSpec.from(options, dtstart = 0L)
            true
        } catch (_: IllegalArgumentException) {
            false
        } catch (_: IllegalStateException) {
            false
        } catch (_: ClassCastException) {
            false
        }
    }
}
