package page.planr.android.core.insights

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import page.planr.android.core.insights.analytics.MomentumAnalytics
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.Streak

/**
 * [MomentumAnalytics.elapsedStreak] (optimize-tab.tsx:244-247; no TS export, so
 * no fixture): the streak over the days that have started, so a period's
 * future days don't read as a broken streak.
 */
class ElapsedStreakTest {

    private fun week(vararg hours: Int) = hours.mapIndexed { i, h -> DayUsage(T0 + i * DAY, h * HOUR) }

    @Test
    fun `every day still ahead gives null`() {
        assertNull(MomentumAnalytics.elapsedStreak(week(1, 2, 3, 4, 5, 6, 7), now = T0 - 1))
    }

    @Test
    fun `today in the middle counts back from today`() {
        val days = week(2, 0, 3, 4, 0, 0, 0)
        // Thursday mid-afternoon: Mon–Thu have started; Thu counts even before it has time.
        val now = T0 + 3 * DAY + 15 * HOUR
        assertEquals(Streak(current = 2, longest = 2), MomentumAnalytics.elapsedStreak(days, now))
        // The untrimmed series ends on future zeros and would read as broken.
        assertEquals(Streak(current = 0, longest = 2), MomentumAnalytics.activeStreak(days))
        // A day counts from its exact start.
        assertEquals(Streak(current = 0, longest = 2), MomentumAnalytics.elapsedStreak(days, T0 + 4 * DAY))
    }

    @Test
    fun `a past window is the same as activeStreak`() {
        val days = week(2, 0, 3, 4, 5, 0, 1)
        val now = T0 + 30 * DAY
        assertEquals(MomentumAnalytics.activeStreak(days), MomentumAnalytics.elapsedStreak(days, now))
    }

    private companion object {
        const val HOUR = 3_600_000L
        const val DAY = 24 * HOUR

        /** Monday 2026-06-01 00:00 UTC. */
        const val T0 = 1_780_272_000_000L
    }
}
