package page.planr.android.feature.agenda.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.feature.agenda.model.MIN_BLOCK_MINUTES
import page.planr.android.feature.agenda.model.PositionedBlock

/** Line height of a day-view block's 12sp title. */
internal val BlockTitleLineHeight = 15.sp

/** Line height of a week-view block's 11sp title. */
internal val CompactBlockTitleLineHeight = 13.sp

/** Vertical padding inside a timed block, top and bottom each. */
internal val BlockPaddingVertical = 3.dp

/** Space between the rows of a timed block (title, time, context hint). */
internal val BlockRowGap = 1.dp

/**
 * The agenda grid's sizes at the system font scale. Text in the grid grows
 * with the font size, so the boxes holding it grow too: hours get taller,
 * the gutter wider, chips and the date circle larger. The grid itself stops
 * growing at [MAX_GRID_SCALE] so a day still fits a useful span on screen.
 *
 * The `*Line` values are the text line heights in dp; [blockFit] counts
 * them to decide what a block of a given height can show.
 */
@Immutable
internal data class AgendaMetrics(
    /** Height of one hour in the grid. */
    val hourHeight: Dp,
    /** Width of the hour-label gutter. */
    val gutterWidth: Dp,
    /** Diameter of the week header's date circle. */
    val dateCircle: Dp,
    /** Height of an all-day chip. */
    val allDayChipHeight: Dp,
    /** One title line in a day-view block. */
    val titleLine: Dp,
    /** One title line in a week-view block. */
    val compactTitleLine: Dp,
    /** One line of time text (block time range, hour labels). */
    val timeLine: Dp,
    /** One line of the context hint under a block's time. */
    val hintLine: Dp,
)

/** The grid stops growing here (160%): beyond it, hours would crowd the screen out. */
internal const val MAX_GRID_SCALE = 1.6f

/** Android's largest font size (200%); the gutter tracks its label up to it. */
internal const val MAX_FONT_SCALE = 2f

/**
 * [AgendaMetrics] at [fontScale]. [timeLineHeight] and [labelLineHeight]
 * are the theme's time and small-label line heights in sp.
 *
 * Line heights convert linearly (sp × fontScale). Android 14+ scales large
 * text less than that, so on those devices a line is at most this tall and
 * the counts in [blockFit] err on the side of showing less, never clipping.
 */
internal fun agendaMetrics(fontScale: Float, timeLineHeight: TextUnit, labelLineHeight: TextUnit): AgendaMetrics {
    val grid = fontScale.coerceIn(1f, MAX_GRID_SCALE)
    // The gutter must hold a label like "11 PM" on one line, so it follows
    // the text further than the grid does.
    val text = fontScale.coerceIn(1f, MAX_FONT_SCALE)
    fun TextUnit.line(): Dp = (value * fontScale).dp
    return AgendaMetrics(
        hourHeight = 52.dp * grid,
        gutterWidth = 44.dp * text,
        dateCircle = 26.dp * grid,
        allDayChipHeight = 22.dp * grid,
        titleLine = BlockTitleLineHeight.line(),
        compactTitleLine = CompactBlockTitleLineHeight.line(),
        timeLine = timeLineHeight.line(),
        hintLine = labelLineHeight.line(),
    )
}

/** What a timed block can show at its height: title lines, then the time, then the context hint. */
internal data class BlockFit(val titleLines: Int, val showTime: Boolean, val showHint: Boolean)

/**
 * Fits a block's rows into [height], counting whole text lines. The title
 * always gets a line; a day-view block then adds the time range, a second
 * title line and the context hint, in that order, while each one fits. A
 * week-view ([compact]) block is title only, as many lines as fit.
 */
internal fun AgendaMetrics.blockFit(height: Dp, compact: Boolean): BlockFit {
    val inner = height - BlockPaddingVertical * 2
    if (compact) {
        return BlockFit(titleLines = (inner / compactTitleLine).toInt().coerceAtLeast(1), showTime = false, showHint = false)
    }
    val withTime = titleLine + BlockRowGap + timeLine
    val showTime = inner >= withTime
    val twoLines = showTime && inner >= withTime + titleLine
    val showHint = twoLines && inner >= withTime + titleLine + BlockRowGap + hintLine
    return BlockFit(titleLines = if (twoLines) 2 else 1, showTime = showTime, showHint = showHint)
}

/** Height of a Month view chip: one small-label line and a little air, growing with the font. */
internal val AgendaMetrics.monthChipHeight: Dp get() = hintLine + 2.dp

/**
 * How many chip rows fit a Month cell of [cellHeight] under its date circle
 * (a cell never shows more than [maxSlots]); at least one, which then holds "+N".
 */
internal fun AgendaMetrics.monthChipSlots(cellHeight: Dp, maxSlots: Int): Int =
    ((cellHeight - dateCircle - 4.dp) / monthChipHeight).toInt().coerceIn(1, maxSlots)

/** Distance from midnight to [minuteOfDay] in the grid. */
internal fun AgendaMetrics.offsetOf(minuteOfDay: Float): Dp = hourHeight * (minuteOfDay / 60f)

/** A laid-out block's height, a hairline short of its span so stacked blocks stay apart. */
internal fun AgendaMetrics.blockHeight(p: PositionedBlock): Dp =
    hourHeight * (maxOf(p.endMinute - p.startMinute, MIN_BLOCK_MINUTES) / 60f) - 1.dp

/**
 * The half-hour slot under a tap at [yPx] down a day column, as minutes
 * from midnight (the last slot starts at 23:30).
 */
internal fun slotMinuteAt(yPx: Float, hourHeightPx: Float): Int {
    val minute = (yPx / hourHeightPx * 60).toInt()
    return (minute / 30 * 30).coerceIn(0, 23 * 60 + 30)
}

/** Scroll offset (px) that puts [hours] (from midnight) at the top of the grid. */
internal fun scrollOffsetFor(hours: Float, hourHeightPx: Float): Int = (hours.coerceIn(0f, 23f) * hourHeightPx).toInt()

/** The grid position, in hours from midnight, at scroll offset [scrollPx]; the inverse of [scrollOffsetFor]. */
internal fun gridHoursAt(scrollPx: Int, hourHeightPx: Float): Float = scrollPx / hourHeightPx

/** The agenda's metrics; provided at [page.planr.android.feature.agenda.AgendaScreen]'s root. */
internal val LocalAgendaMetrics = staticCompositionLocalOf {
    agendaMetrics(fontScale = 1f, timeLineHeight = 13.sp, labelLineHeight = 13.sp)
}

/** [AgendaMetrics] for the current font scale and theme. */
@Composable
internal fun rememberAgendaMetrics(): AgendaMetrics {
    val fontScale = LocalDensity.current.fontScale
    val timeLine = PlanrTheme.type.time.lineHeight
    val labelLine = MaterialTheme.typography.labelSmall.lineHeight
    return remember(fontScale, timeLine, labelLine) { agendaMetrics(fontScale, timeLine, labelLine) }
}
