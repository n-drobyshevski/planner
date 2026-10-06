package page.planr.android.core.design.component

import kotlin.test.Test
import kotlin.test.assertEquals

class SleepRatingSheetTest {

    @Test
    fun `anchor words drop the level number, in either language`() {
        assertEquals("Poor", ratingWord("1 Poor"))
        assertEquals("Neither alert nor sleepy", ratingWord("5 Neither alert nor sleepy"))
        assertEquals("Борюсь со сном", ratingWord("9 Борюсь со сном"))
        assertEquals("Great", ratingWord("Great"))
    }

    @Test
    fun `the scales match the web's`() {
        assertEquals(7, SleepRatingDraft.QUALITY_LEVELS)
        assertEquals(9, SleepRatingDraft.FATIGUE_LEVELS)
    }
}
