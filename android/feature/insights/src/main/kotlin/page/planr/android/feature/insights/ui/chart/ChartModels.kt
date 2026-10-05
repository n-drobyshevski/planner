package page.planr.android.feature.insights.ui.chart

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Chart heights (tab-bits.tsx `CHART_H`); the tick row adds 20 dp below. */
object ChartHeights {
    val Compact = 180.dp
    val Standard = 220.dp
}

/** One bar series; [alpha] < 1 for a ghost (the previous period). */
@Immutable
data class BarSeries(val key: String, val values: List<Long>, val color: Color, val alpha: Float = 1f)

/** A line drawn over the bars through the band centers. */
@Immutable
data class LineOverlay(val key: String, val values: List<Double>, val color: Color, val dashed: Boolean = false)

@Immutable
data class BarChartData(
    /** Grouped side by side in list order within each band. */
    val series: List<BarSeries>,
    /** The series that markers and `onOpen` refer to. */
    val primary: Int = series.lastIndex,
    val lines: List<LineOverlay> = emptyList(),
    /** A dashed comparison-colored line (the typical day). */
    val referenceY: Double? = null,
    /** Band indices with a hollow circle at the primary value (unusual days). */
    val markers: Set<Int> = emptySet(),
    /** One per band (sparsified when drawn). */
    val ticks: List<String>,
)

@Immutable
data class LineSeries(val key: String, val label: String, val values: List<Long>, val color: Color)

@Immutable
data class ShareSegment(val key: String, val weight: Long, val color: Color)

/** A row of the horizontal bars: [description] is its spoken text. */
@Immutable
data class HBarRow(val label: String, val value: Double, val valueText: String, val description: String)

/** A tooltip line; a null [color] has no swatch. */
@Immutable
data class TooltipRow(val color: Color?, val label: String, val value: String)

/** One band's tooltip AND its spoken description (ChartA11y.describe). Rows with a null value are omitted by the caller. */
@Immutable
data class BandInfo(val title: String, val rows: List<TooltipRow>)

@Immutable
data class HeatmapData(
    /** 7, Monday-first. */
    val rowLabels: List<String>,
    /** 6 four-hour bands: "0–4" … "20–24". */
    val columnLabels: List<String>,
    /** [row][col] ms. */
    val values: List<List<Long>>,
    val cellDescriptions: List<List<String>>,
)
