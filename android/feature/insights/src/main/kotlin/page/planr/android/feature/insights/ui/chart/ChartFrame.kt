package page.planr.android.feature.insights.ui.chart

import android.content.res.Configuration
import android.os.SystemClock
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.drawText
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import kotlin.math.abs
import kotlin.math.roundToInt
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.feature.insights.ui.components.rememberReducedMotion

// The machinery the band charts share (BarChart, LineChart, StackedBarChart):
// plot insets, the grow-in and value animations, tap / scrub selection, the
// per-band accessibility nodes, the tooltip popup and the common drawing.

/** Plot margins (chart-frame.tsx `INSIGHTS_CHART_MARGIN`) and the tick row under the plot. */
internal object ChartInsets {
    val Top = 8.dp
    val Left = 4.dp
    val Right = 4.dp

    /** The tick-label row below the plot (the chart heights exclude it). */
    val TickRow = 20.dp

    /** Plot bottom to the top of a tick label. */
    val TickGap = 6.dp

    /** Recharts `minTickGap`. */
    val MinTickGap = 24.dp

    /** Gap between grouped bars. */
    val BarGap = 1.dp
    val BarRadius = 3.dp
}

/** The plot rect of a band chart whose canvas is [width] wide, with a plot [plotHeightPx] tall from the canvas top. */
internal fun Density.plotRect(width: Float, plotHeightPx: Float): Rect =
    Rect(ChartInsets.Left.toPx(), ChartInsets.Top.toPx(), width - ChartInsets.Right.toPx(), plotHeightPx)

// --- Motion ------------------------------------------------------------------------

private const val GROW_MS = 250
private const val TWEEN_MS = 150

/**
 * The grow-in factor (0 → 1): runs once per [animationKey], the (tab, window,
 * granularity) being looked at. A data-only recompute under the same key does
 * not re-grow, and neither does scrolling the chart back into view (the last
 * grown key is saved). Static under reduced motion and in previews.
 */
@Composable
internal fun rememberGrowth(animationKey: Any): Animatable<Float, AnimationVector1D> {
    val still = rememberReducedMotion() || LocalInspectionMode.current
    val key = animationKey.hashCode()
    var grownKey by rememberSaveable { mutableStateOf<Int?>(null) }
    val growth = remember(key) { Animatable(if (still || grownKey == key) 1f else 0f) }
    LaunchedEffect(key, still) {
        grownKey = key
        if (still) growth.snapTo(1f) else growth.animateTo(1f, tween(GROW_MS, easing = FastOutSlowInEasing))
    }
    return growth
}

/**
 * Drawn values that move from old to new over 150 ms when the data changes
 * under the same animation key (a partner's edit, a filter toggle). A change
 * of shape, reduced motion or a new key just snaps.
 */
@Stable
internal class ValueTween(initial: List<DoubleArray>) {
    private var from: List<DoubleArray> = initial
    private var to by mutableStateOf(initial)
    private val progress = Animatable(1f)

    /** The values to draw now; read it in a draw lambda so only drawing reruns. */
    fun current(): List<DoubleArray> {
        val target = to
        val p = progress.value
        if (p >= 1f) return target
        val start = from
        return target.mapIndexed { i, values ->
            val old = start.getOrNull(i)
            if (old == null || old.size != values.size) values else DoubleArray(values.size) { j -> old[j] + (values[j] - old[j]) * p }
        }
    }

    suspend fun retarget(target: List<DoubleArray>, animate: Boolean) {
        if (target === to) return
        val sameShape = target.size == to.size && target.indices.all { target[it].size == to[it].size }
        from = current()
        to = target
        if (animate && sameShape) {
            progress.snapTo(0f)
            progress.animateTo(1f, tween(TWEEN_MS))
        } else {
            progress.snapTo(1f)
        }
    }
}

@Composable
internal fun rememberValueTween(target: List<DoubleArray>, animationKey: Any): ValueTween {
    val still = rememberReducedMotion() || LocalInspectionMode.current
    val tween = remember(animationKey.hashCode()) { ValueTween(target) }
    LaunchedEffect(tween, target) { tween.retarget(target, animate = !still) }
    return tween
}

// --- Selection ---------------------------------------------------------------------

/**
 * The band chart's selection: a tap opens the band (when the chart opens
 * bands) or toggles its tooltip; a long press then drag scrubs; a tap outside
 * the bands, or any touch outside the tooltip, clears it. Plot geometry is
 * pushed in from layout. Times are uptime ms (the touch's own, or the clock's).
 */
@Stable
internal class ChartSelection {
    var selected by mutableStateOf<Int?>(null)
    var plotLeft by mutableFloatStateOf(0f)
    var plotWidth by mutableFloatStateOf(0f)
    var bandCount by mutableIntStateOf(0)
    var onOpen: ((Int) -> Unit)? = null
    private val closed = ClosedTooltip<Int>()

    fun bandAt(x: Float): Int? = ChartGeometry.bandOf(x, plotLeft, plotWidth, bandCount)

    fun center(index: Int): Float = ChartGeometry.bandCenter(index, plotLeft, plotWidth, bandCount)

    fun tap(x: Float, atMillis: Long) {
        val band = bandAt(x)
        val open = onOpen
        val closedByThisTouch = closed.take(band, atMillis)
        when {
            band == null -> selected = null
            open != null -> {
                selected = null
                open(band)
            }
            closedByThisTouch -> selected = null
            else -> selected = if (selected == band) null else band
        }
    }

    fun scrub(x: Float) {
        closed.take(null, 0L)
        bandAt(x)?.let { selected = it }
    }

    /** A touch outside the tooltip (or on it): close it. */
    fun dismiss(atMillis: Long) {
        closed.record(selected, atMillis)
        selected = null
    }
}

/**
 * Which tooltip a touch just closed. The touch that closes a popup still
 * reaches what is under it, so when it lands on the very item whose tooltip
 * it closed, [take] says so and the tap toggles the tooltip off instead of
 * reopening it.
 */
internal class ClosedTooltip<T : Any> {
    private var item: T? = null
    private var atMillis = 0L

    fun record(item: T?, atMillis: Long) {
        this.item = item
        this.atMillis = atMillis
    }

    /** Whether a tap on [item] at [atMillis] is the touch that closed its tooltip; forgets it either way. */
    fun take(item: T?, atMillis: Long): Boolean {
        val same = item != null && item == this.item && abs(atMillis - this.atMillis) <= SAME_TOUCH_MS
        this.item = null
        return same
    }

    private companion object {
        /** A tap's down-to-up span is under the long-press timeout (≤ 500 ms), plus slack. */
        const val SAME_TOUCH_MS = 600L
    }
}

/** Tap and long-press-scrub over the chart's bands. A vertical scroll of the list wins over a plain drag. */
internal fun Modifier.bandGestures(selection: ChartSelection): Modifier = pointerInput(selection) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        var up: PointerInputChange? = null
        val released = withTimeoutOrNull(viewConfiguration.longPressTimeoutMillis) {
            up = waitForUpOrCancellation()
            true
        }
        if (released == true) {
            // A null `up` is a cancelled gesture (the list scrolled): not a tap.
            up?.let {
                it.consume()
                selection.tap(it.position.x, it.uptimeMillis)
            }
            return@awaitEachGesture
        }
        selection.scrub(down.position.x)
        while (true) {
            val change = awaitPointerEvent().changes.firstOrNull { it.id == down.id } ?: break
            change.consume()
            if (!change.pressed) break
            selection.scrub(change.position.x)
        }
    }
}

/**
 * A band chart's selection, kept across data updates and cleared when the
 * [animationKey] (what is being looked at) changes. Feed it the chart's width
 * with [updatePlot].
 */
@Composable
internal fun rememberSelection(animationKey: Any, bandCount: Int, onOpen: ((Int) -> Unit)?): ChartSelection {
    val selection = remember { ChartSelection() }
    SideEffect {
        selection.onOpen = onOpen
        selection.bandCount = bandCount
        if ((selection.selected ?: -1) >= bandCount) selection.selected = null
    }
    LaunchedEffect(animationKey) { selection.selected = null }
    return selection
}

/** Keeps the selection's plot geometry in step with the chart's width (from `onSizeChanged`). */
internal fun Density.updatePlot(selection: ChartSelection, width: Int) {
    selection.plotLeft = ChartInsets.Left.toPx()
    selection.plotWidth = width - ChartInsets.Left.toPx() - ChartInsets.Right.toPx()
}

// --- Accessibility -----------------------------------------------------------------

/**
 * An invisible row of one semantics node per band over the plot: each says
 * its [ChartA11y.describe] text and, when the chart opens bands, carries the
 * click action. Semantics only, so touches still reach the chart's gestures.
 */
@Composable
internal fun BoxScope.BandSemantics(nodes: List<ChartA11y.BandNode>) {
    Row(
        Modifier
            .matchParentSize()
            .padding(start = ChartInsets.Left, end = ChartInsets.Right, top = ChartInsets.Top, bottom = ChartInsets.TickRow),
    ) {
        for (node in nodes) {
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .semantics {
                        contentDescription = node.description
                        node.onClick?.let { click ->
                            onClick(label = node.clickLabel) {
                                click()
                                true
                            }
                        }
                    },
            )
        }
    }
}

// --- Tooltip -----------------------------------------------------------------------

/**
 * The selected band's tooltip, floating above the chart at the band's center.
 * Any touch closes it, outside it (a scroll, another control, the chart
 * itself) or on it, so it never lingers over the list or blocks what it covers.
 */
@Composable
internal fun BandTooltip(selection: ChartSelection, bands: List<BandInfo>) {
    val index = selection.selected ?: return
    val band = bands.getOrNull(index) ?: return
    val centerX = selection.center(index).roundToInt()
    val gap = with(LocalDensity.current) { TOOLTIP_GAP.roundToPx() }
    val position = remember(centerX, gap) { TooltipPosition(centerX, gap) }
    TooltipPopup(position, onClose = { selection.dismiss(SystemClock.uptimeMillis()) }) {
        ChartTooltip(band.title, band.rows)
    }
}

/** A non-focusable tooltip popup that calls [onClose] on any touch, outside it or on it. */
@Composable
internal fun TooltipPopup(position: PopupPositionProvider, onClose: () -> Unit, content: @Composable () -> Unit) {
    val close by rememberUpdatedState(onClose)
    Popup(
        popupPositionProvider = position,
        onDismissRequest = { close() },
        properties = PopupProperties(focusable = false, dismissOnClickOutside = true),
    ) {
        Box(
            Modifier.pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    close()
                }
            },
        ) {
            content()
        }
    }
}

internal val TOOLTIP_GAP = 4.dp

/**
 * Above the anchor (or over its top edge when there is no room), centered on
 * [anchorX] (relative to the anchor; null = the anchor's center), clamped to
 * the anchor's width when it fits and always to the window.
 */
internal class TooltipPosition(private val anchorX: Int?, private val gap: Int) : PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset {
        val w = popupContentSize.width
        val h = popupContentSize.height
        var x = anchorBounds.left + (anchorX ?: (anchorBounds.width / 2)) - w / 2
        if (anchorX != null && w <= anchorBounds.width) x = x.coerceIn(anchorBounds.left, anchorBounds.right - w)
        x = x.coerceIn(0, maxOf(0, windowSize.width - w))
        var y = anchorBounds.top - h - gap
        if (y < 0) y = anchorBounds.top + gap
        y = y.coerceIn(0, maxOf(0, windowSize.height - h))
        return IntOffset(x, y)
    }
}

// --- Drawing -----------------------------------------------------------------------

// Called from draw lambdas, which rerun on every frame of the grow-in, the
// value tween and a scrub: nothing here allocates per call. Paths, strokes,
// dash effects and scratch arrays are built once in `drawWithCache`.

/** Three gridlines at 0, 50% and 100% of the plot, or only the baseline when nothing is drawn. */
internal fun DrawScope.drawGrid(plot: Rect, color: Color, hasData: Boolean) {
    val stroke = 1.dp.toPx()
    drawLine(color, Offset(plot.left, plot.bottom), Offset(plot.right, plot.bottom), stroke)
    if (!hasData) return
    val middle = plot.center.y
    drawLine(color, Offset(plot.left, middle), Offset(plot.right, middle), stroke)
    drawLine(color, Offset(plot.left, plot.top), Offset(plot.right, plot.top), stroke)
}

/** A bar from [left] to [right] and [top] to [bottom] with its top corners rounded (radius clamped to the bar), reusing [path]. */
internal fun DrawScope.drawTopRoundedBar(path: Path, left: Float, top: Float, right: Float, bottom: Float, radius: Float, color: Color) {
    val width = right - left
    val height = bottom - top
    if (width <= 0f || height <= 0f) return
    val r = minOf(radius, width / 2f, height)
    val k = r * (1f - ARC_KAPPA) // a quarter circle as one cubic
    path.reset()
    path.moveTo(left, bottom)
    path.lineTo(left, top + r)
    path.cubicTo(left, top + k, left + k, top, left + r, top)
    path.lineTo(right - r, top)
    path.cubicTo(right - k, top, right, top + k, right, top + r)
    path.lineTo(right, bottom)
    path.close()
    drawPath(path, color)
}

/** The cubic Bézier constant for a quarter circle. */
private const val ARC_KAPPA = 0.5522848f

/** Scratch arrays for a monotone curve of up to [capacity] points: fill [ys], then [drawMonotone]. */
internal class CurveBuffers(capacity: Int) {
    val ys = FloatArray(capacity)
    val tangents = FloatArray(capacity)
    val controls = FloatArray(6 * maxOf(0, capacity - 1))
}

/** A monotone curve (d3 curveMonotoneX) through the first [n] of [xs] and [curve]'s ys, reusing [path]. */
internal fun DrawScope.drawMonotone(path: Path, xs: FloatArray, curve: CurveBuffers, n: Int, color: Color, stroke: Stroke) {
    if (n <= 0) return
    path.reset()
    path.moveTo(xs[0], curve.ys[0])
    val c = curve.controls
    val segments = ChartGeometry.monotoneInto(xs, curve.ys, n, curve.tangents, c)
    for (k in 0 until segments) {
        val o = 6 * k
        path.cubicTo(c[o], c[o + 1], c[o + 2], c[o + 3], c[o + 4], c[o + 5])
    }
    drawPath(path, color, style = stroke)
}

/** The `[4, 4]` dash of the reference and dashed lines (build it once, in `drawWithCache`). */
internal fun Density.dashEffect(): PathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 4.dp.toPx()))

/** The vertical cursor of the selected band. */
internal fun DrawScope.drawCursor(plot: Rect, x: Float, color: Color) {
    drawLine(color, Offset(x, plot.top), Offset(x, plot.bottom), 1.dp.toPx())
}

/** The sparsified tick labels under the plot, centered on their bands and kept inside the canvas. */
internal fun DrawScope.drawTicks(plot: Rect, centers: List<Float>, labels: List<TextLayoutResult>, indices: List<Int>, color: Color) {
    val top = plot.bottom + ChartInsets.TickGap.toPx()
    for (i in indices) {
        val label = labels.getOrNull(i) ?: continue
        val w = label.size.width.toFloat()
        val x = (centers[i] - w / 2f).coerceIn(0f, maxOf(0f, size.width - w))
        drawText(label, color = color, topLeft = Offset(x, top))
    }
}

/** Which tick labels fit, for band [centers] and measured [labels]. */
internal fun Density.tickIndices(centers: List<Float>, labels: List<TextLayoutResult>): List<Int> =
    ChartGeometry.sparseTickIndices(
        centers.take(labels.size),
        labels.map { it.size.width.toFloat() },
        ChartInsets.MinTickGap.toPx(),
    )

// --- Previews ----------------------------------------------------------------------

/** Light and dark previews of an Insights chart or component. */
@Preview(name = "Light", showBackground = true, backgroundColor = 0xFFFAF8F5, widthDp = 360)
@Preview(
    name = "Dark",
    showBackground = true,
    backgroundColor = 0xFF1C1917,
    widthDp = 360,
    uiMode = Configuration.UI_MODE_NIGHT_YES or Configuration.UI_MODE_TYPE_NORMAL,
)
internal annotation class InsightsPreviews

/** The paper a preview sits on, in the Planr theme of the preview's night mode. */
@Composable
internal fun PreviewSurface(content: @Composable () -> Unit) {
    PlanrTheme {
        Surface(color = MaterialTheme.colorScheme.background) {
            Box(Modifier.padding(16.dp)) { content() }
        }
    }
}

/** Fixed preview data: a week of tracked hours (ms), with literal labels (no A3 formatting in previews). */
internal object PreviewData {
    const val HOUR = 3_600_000L
    val week: List<Long> = listOf(3, 5, 0, 7, 4, 2, 6).map { it * HOUR + 15 * 60_000L }
    val weekPrev: List<Long> = listOf(2, 4, 3, 5, 5, 1, 0).map { it * HOUR }
    val weekTicks = listOf("8", "9", "10", "11", "12", "13", "14")
    val weekBands: List<BandInfo> = week.mapIndexed { i, ms ->
        BandInfo("Day ${weekTicks[i]} Jun", listOf(TooltipRow(null, "Tracked", "${ms / HOUR}h 15m")))
    }
}
