package page.planr.android.feature.insights.ui.chart

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ChartSelectionTest {

    /** 7 bands of 50 px over [0, 350). */
    private fun selection(onOpen: ((Int) -> Unit)? = null) = ChartSelection().apply {
        plotLeft = 0f
        plotWidth = 350f
        bandCount = 7
        this.onOpen = onOpen
    }

    private fun x(band: Int) = band * 50f + 25f

    @Test
    fun `a tap toggles the band's tooltip and a tap beside the bands clears it`() {
        val s = selection()
        s.tap(x(2), 1_000)
        assertEquals(2, s.selected)
        s.tap(x(4), 2_000)
        assertEquals(4, s.selected)
        s.tap(x(4), 3_000)
        assertNull(s.selected)
        s.tap(x(4), 4_000)
        s.tap(-1f, 5_000)
        assertNull(s.selected)
    }

    @Test
    fun `a touch outside the tooltip closes it, and when it lands on the same band it stays closed`() {
        val s = selection()
        s.tap(x(3), 1_000)
        // The popup sees the touch at its down; the chart sees the tap at its up.
        s.dismiss(5_000)
        assertNull(s.selected)
        s.tap(x(3), 5_120)
        assertNull(s.selected, "the closing touch toggles it off, it does not reopen it")

        s.tap(x(3), 6_000)
        assertEquals(3, s.selected, "a later tap opens it again")
        s.dismiss(7_000)
        s.tap(x(5), 7_100)
        assertEquals(5, s.selected, "the closing touch on another band moves the tooltip there")
    }

    @Test
    fun `a closing touch elsewhere does not swallow a later tap on that band`() {
        val s = selection()
        s.tap(x(1), 1_000)
        s.dismiss(2_000) // e.g. the list scrolled
        s.tap(x(1), 4_000)
        assertEquals(1, s.selected)
    }

    @Test
    fun `charts that open bands open on a tap and keep no tooltip`() {
        val opened = mutableListOf<Int>()
        val s = selection(onOpen = { opened += it })
        s.scrub(x(2))
        assertEquals(2, s.selected)
        s.dismiss(1_000)
        s.tap(x(2), 1_050)
        assertEquals(listOf(2), opened)
        assertNull(s.selected)
    }
}
