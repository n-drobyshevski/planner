package page.planr.android.feature.insights.ui.chart

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ChartGeometryTest {

    // --- Bands -----------------------------------------------------------------------

    @Test
    fun `band hit-testing at the edges`() {
        // 7 bands over [10, 360): 50 px each.
        assertEquals(0, ChartGeometry.bandOf(10f, 10f, 350f, 7))
        assertEquals(0, ChartGeometry.bandOf(59.99f, 10f, 350f, 7))
        assertEquals(1, ChartGeometry.bandOf(60f, 10f, 350f, 7))
        assertEquals(6, ChartGeometry.bandOf(359.99f, 10f, 350f, 7))
        assertNull(ChartGeometry.bandOf(9.99f, 10f, 350f, 7), "left of the plot")
        assertNull(ChartGeometry.bandOf(360f, 10f, 350f, 7), "the plot's right edge is outside (half-open)")
        assertNull(ChartGeometry.bandOf(100f, 10f, 350f, 0), "no bands")
        assertNull(ChartGeometry.bandOf(100f, 10f, 0f, 7), "no width yet")
    }

    @Test
    fun `366 bands still resolve every position to one band`() {
        val n = 366
        val width = 328f
        val hits = (0 until 3280).mapNotNull { ChartGeometry.bandOf(it / 10f, 0f, width, n) }.toSet()
        assertEquals((0 until n).toSet(), hits)
    }

    @Test
    fun `bars take 80 percent of the band, split evenly with the gap`() {
        val plot = Rect(0f, 0f, 100f, 200f)
        // 2 bands of 50: the group is 40 wide, starting 5 in; 2 bars of 19.5 with a gap of 1.
        val ghost = ChartGeometry.barRect(1, 0, 2, 50.0, 100.0, plot, 1f, bandCount = 2)
        val main = ChartGeometry.barRect(1, 1, 2, 100.0, 100.0, plot, 1f, bandCount = 2)
        assertEquals(55f, ghost.left, 1e-4f)
        assertEquals(74.5f, ghost.right, 1e-4f)
        assertEquals(75.5f, main.left, 1e-4f)
        assertEquals(95f, main.right, 1e-4f)
        assertEquals(100f, ghost.top, 1e-4f)
        assertEquals(0f, main.top, 1e-4f)
        assertEquals(200f, main.bottom, 1e-4f)
        // yMax 0: flat on the baseline.
        assertEquals(200f, ChartGeometry.barRect(0, 0, 1, 5.0, 0.0, plot, 1f, bandCount = 2).top)
    }

    // --- Y domain --------------------------------------------------------------------

    @Test
    fun `yMax is the largest drawn value and ignores a reference line above the data`() {
        val bars = listOf(3_600_000L, 7_200_000L, 0L)
        val avg = listOf(1_000_000.0, 5_400_000.0)
        val typicalDay = 9_000_000.0
        val yMax = ChartGeometry.yMax(bars, avg)
        assertEquals(7_200_000.0, yMax)
        // The caller never passes the reference line, and draws it only when it is within the domain.
        assertTrue(typicalDay > yMax)
        assertEquals(0.0, ChartGeometry.yMax(), "nothing drawn")
        assertEquals(0.0, ChartGeometry.yMax(listOf(0L, 0L), null), "all zero: only the baseline")
    }

    // --- Ticks -----------------------------------------------------------------------

    @Test
    fun `sparse ticks keep the first and the last, and never collide`() {
        for (n in listOf(7, 31, 90, 366)) {
            val width = 328f
            val bw = width / n
            val centers = List(n) { (it + 0.5f) * bw }
            val widths = List(n) { if (it % 10 == 9) 28f else 14f } // "30" / "1 Jul" style labels
            val gap = 24f
            val kept = ChartGeometry.sparseTickIndices(centers, widths, gap)
            assertEquals(0, kept.first(), "n=$n keeps the first")
            assertEquals(n - 1, kept.last(), "n=$n keeps the last")
            assertEquals(kept.sorted(), kept, "n=$n in order")
            kept.zipWithNext().forEach { (a, b) ->
                val right = centers[a] + widths[a] / 2
                val left = centers[b] - widths[b] / 2
                // Only the forced first / last pair may sit closer (a 2-band chart with wide labels).
                if (!(a == 0 && b == n - 1)) assertTrue(left - right >= gap, "n=$n: $a and $b collide")
            }
        }
    }

    @Test
    fun `a week of short labels shows every tick`() {
        val centers = List(7) { 25f + it * 50f }
        assertEquals((0..6).toList(), ChartGeometry.sparseTickIndices(centers, List(7) { 14f }, 24f))
    }

    @Test
    fun `an interior label that would hit the last one is dropped`() {
        // 0 at 0, 1 at 40, 2 at 70: 1 clears 0 but would collide with the last.
        val kept = ChartGeometry.sparseTickIndices(listOf(0f, 40f, 70f), listOf(10f, 10f, 10f), 24f)
        assertEquals(listOf(0, 2), kept)
        assertEquals(listOf(0), ChartGeometry.sparseTickIndices(listOf(5f), listOf(10f), 24f))
        assertEquals(emptyList(), ChartGeometry.sparseTickIndices(emptyList(), emptyList(), 24f))
    }

    // --- Curves ----------------------------------------------------------------------

    @Test
    fun `the monotone curve does not overshoot a step series`() {
        val ys = listOf(0f, 0f, 10f, 10f, 10f, 0f, 0f, 5f)
        val points = ys.mapIndexed { i, y -> Offset(i * 20f, y) }
        val controls = ChartGeometry.monotonePath(points)
        assertEquals(3 * (points.size - 1), controls.size)
        for (seg in 0 until points.size - 1) {
            val lo = minOf(points[seg].y, points[seg + 1].y)
            val hi = maxOf(points[seg].y, points[seg + 1].y)
            for (c in controls.subList(seg * 3, seg * 3 + 2)) {
                assertTrue(c.y in lo - 1e-4f..hi + 1e-4f, "segment $seg control $c leaves [$lo, $hi]")
                assertTrue(c.x in points[seg].x..points[seg + 1].x, "segment $seg control x $c")
            }
            assertEquals(points[seg + 1], controls[seg * 3 + 2])
        }
    }

    @Test
    fun `two points make a straight segment, one makes none`() {
        val controls = ChartGeometry.monotonePath(listOf(Offset(0f, 0f), Offset(30f, 30f)))
        assertEquals(listOf(Offset(10f, 10f), Offset(20f, 20f), Offset(30f, 30f)), controls)
        assertEquals(emptyList(), ChartGeometry.monotonePath(listOf(Offset(0f, 0f))))
    }

    // --- Stacking --------------------------------------------------------------------

    @Test
    fun `stacking with zeros keeps empty ranges at the running top`() {
        val stacked = ChartGeometry.stacked(
            listOf(
                listOf(10L, 0L, 5L),
                listOf(0L, 0L, 5L),
                listOf(3L, 4L), // shorter: the missing column counts as 0
            ),
        )
        assertEquals(
            listOf(
                listOf(0L to 10L, 10L to 10L, 10L to 13L),
                listOf(0L to 0L, 0L to 0L, 0L to 4L),
                listOf(0L to 5L, 5L to 10L, 10L to 10L),
            ),
            stacked,
        )
        assertEquals(emptyList(), ChartGeometry.stacked(emptyList()))
    }

    // --- Accessibility ---------------------------------------------------------------

    @Test
    fun `describe joins the title and every row`() {
        val one = BandInfo("Wed, 10 Jun", listOf(TooltipRow(null, "Tracked", "4h 30m")))
        assertEquals("Wed, 10 Jun: Tracked 4h 30m", ChartA11y.describe(one))
        val three = BandInfo(
            "8 – 14 Jun 2026",
            listOf(
                TooltipRow(null, "Work", "12h"),
                TooltipRow(null, "Gym", "3h 15m"),
                TooltipRow(null, "Other", "45m"),
            ),
        )
        assertEquals("8 – 14 Jun 2026: Work 12h, Gym 3h 15m, Other 45m", ChartA11y.describe(three))
    }

    @Test
    fun `one node per band, with a click action exactly when the chart opens bands`() {
        val bands = List(31) { BandInfo("Day ${it + 1}", listOf(TooltipRow(null, "Tracked", "${it}h"))) }

        val opened = ArrayList<Int>()
        val open = ChartA11y.bandNodes(bands, onOpen = { opened += it }, openLabel = "Open day")
        assertEquals(bands.size, open.size)
        assertEquals(bands.map(ChartA11y::describe), open.map { it.description })
        assertEquals(bands.indices.toList(), open.map { it.index })
        open.forEach {
            assertNotNull(it.onClick)
            assertEquals("Open day", it.clickLabel)
        }
        open[17].onClick!!.invoke()
        open[0].onClick!!.invoke()
        assertEquals(listOf(17, 0), opened)

        val readOnly = ChartA11y.bandNodes(bands, onOpen = null, openLabel = "Open day")
        assertEquals(bands.size, readOnly.size)
        readOnly.forEach {
            assertNull(it.onClick)
            assertNull(it.clickLabel)
        }
    }

    @Test
    fun `a 366-day chart gets a node for every day`() {
        val bands = List(366) { BandInfo("d$it", emptyList()) }
        val nodes = ChartA11y.bandNodes(bands, onOpen = {}, openLabel = "Open day")
        assertEquals(366, nodes.size)
        assertEquals("d365: ", nodes.last().description)
    }
}
