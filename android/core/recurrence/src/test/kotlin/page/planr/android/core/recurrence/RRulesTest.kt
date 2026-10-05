package page.planr.android.core.recurrence

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RRulesTest {

    @Test
    fun `rules Planr expands are valid`() {
        listOf(
            "FREQ=YEARLY",
            "FREQ=DAILY;UNTIL=20261205",
            "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261130T225959Z",
            "FREQ=WEEKLY;INTERVAL=2;COUNT=6",
            "FREQ=MONTHLY;BYDAY=2TU;UNTIL=20270228T230000Z",
            "FREQ=MONTHLY;BYMONTHDAY=-1",
            "FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
            "freq=weekly;wkst=SU",
        ).forEach { assertTrue(RRules.isValid(it), it) }
    }

    @Test
    fun `sub-daily, unknown and malformed rules are not`() {
        listOf(
            "",
            "FREQ=BOGUS",
            "FREQ=HOURLY;COUNT=4",
            "FREQ=MINUTELY",
            "COUNT=3",
            "FREQ=WEEKLY;FOO=BAR",
            "FREQ=WEEKLY;BYDAY=XX",
            "FREQ=DAILY;COUNT=abc",
            "FREQ=DAILY;UNTIL=tomorrow",
            "FREQ=MONTHLY;BYSETPOS=0;BYDAY=MO",
            "FREQ=DAILY;BYHOUR=25",
            "FREQ=DAILY;INTERVAL",
        ).forEach { assertFalse(RRules.isValid(it), it) }
    }
}
