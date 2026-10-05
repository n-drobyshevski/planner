package page.planr.android.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import kotlinx.datetime.LocalDate
import page.planr.android.core.design.glance.PlanrGlanceColors
import page.planr.android.core.design.theme.parseHexColor
import page.planr.android.feature.quickadd.QuickAddActivity
import page.planr.android.feature.quickadd.QuickAddKind

// The pieces the grid widgets (Month, Week grid) share: header paging and
// add, the date label, event chips and the "+N" overflow line.

/** Header end: ‹ ›, then a filled + pill that opens Quick add for an event. */
@Composable
internal fun CalendarHeaderActions(previous: Action, previousLabel: String, next: Action, nextLabel: String) {
    val context = LocalContext.current
    HeaderIcon(R.drawable.ic_widget_chevron_left, previousLabel, previous)
    HeaderIcon(R.drawable.ic_widget_chevron_right, nextLabel, next)
    Box(
        modifier = GlanceModifier
            .padding(start = 6.dp)
            .background(ImageProvider(R.drawable.widget_pill), colorFilter = ColorFilter.tint(GlanceTheme.colors.primary))
            .cornerRadius(999.dp)
            .padding(horizontal = 14.dp, vertical = 5.dp)
            .clickable(actionStartActivity(QuickAddActivity.intent(context, QuickAddKind.Event))),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            provider = ImageProvider(R.drawable.ic_widget_plus),
            contentDescription = context.getString(R.string.widget_month_add_event),
            colorFilter = ColorFilter.tint(GlanceTheme.colors.onPrimary),
            modifier = GlanceModifier.size(18.dp),
        )
    }
}

@Composable
private fun HeaderIcon(icon: Int, label: String, onClick: Action) {
    Image(
        provider = ImageProvider(icon),
        contentDescription = label,
        colorFilter = ColorFilter.tint(GlanceTheme.colors.onSurfaceVariant),
        modifier = GlanceModifier.size(32.dp).padding(6.dp).clickable(onClick),
    )
}

/** A day's date; today in a filled circle, days outside the shown period muted. */
@Composable
internal fun DateLabel(date: LocalDate, isToday: Boolean, muted: Boolean = false) {
    val style = TextStyle(
        color = when {
            isToday -> GlanceTheme.colors.onPrimary
            muted -> GlanceTheme.colors.onSurfaceVariant
            else -> GlanceTheme.colors.onSurface
        },
        fontSize = 14.sp,
        fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
        textAlign = TextAlign.Center,
    )
    val circle = GlanceModifier.size(DATE_CIRCLE)
    Box(
        modifier = if (isToday) {
            circle
                .background(ImageProvider(R.drawable.widget_dot), colorFilter = ColorFilter.tint(GlanceTheme.colors.primary))
                .cornerRadius(DATE_CIRCLE / 2)
        } else {
            circle
        },
        contentAlignment = Alignment.Center,
    ) {
        Text(text = date.day.toString(), maxLines = 1, style = style)
    }
}

/**
 * Up to [slots] of [chips], the last slot turning into "+N" when they don't
 * all fit ([MonthGridModel.chipLayout]). Emits into the caller's column.
 */
@Composable
internal fun ChipStack(chips: List<MonthChip>, slots: Int, faded: Boolean = false) {
    val context = LocalContext.current
    val (shown, more) = MonthGridModel.chipLayout(slots, chips.size)
    chips.take(shown).forEach { chip -> Chip(chip, faded) }
    if (more > 0) {
        Text(
            text = context.getString(R.string.widget_month_more, more),
            maxLines = 1,
            style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 10.sp),
            modifier = GlanceModifier.height(CHIP_HEIGHT),
        )
    }
}

/** A filled chip in the event's agenda colour; the 1 dp around it is the gap between chips. */
@Composable
private fun Chip(chip: MonthChip, faded: Boolean) {
    val context = LocalContext.current
    Box(modifier = GlanceModifier.fillMaxWidth().height(CHIP_HEIGHT).padding(horizontal = 2.dp, vertical = 1.dp)) {
        Text(
            text = chip.title.ifBlank { context.getString(R.string.widget_untitled_event) },
            maxLines = 1,
            style = TextStyle(color = PlanrGlanceColors.onMeaningFill, fontSize = 10.sp, fontWeight = FontWeight.Medium),
            modifier = GlanceModifier
                .fillMaxSize()
                .background(chipColor(chip, faded))
                .cornerRadius(3.dp)
                .padding(horizontal = 3.dp),
        )
    }
}

@Composable
private fun chipColor(chip: MonthChip, faded: Boolean): ColorProvider {
    val own = parseHexColor(chip.colorHex, Color.Unspecified)
        .takeIf { it != Color.Unspecified }
        ?.let { if (faded) it.copy(alpha = FADED_ALPHA) else it }
    return own?.let { ColorProvider(it) } ?: toneColor(chip.tone)
}

/** Opens [date] in the agenda's day view. */
internal fun openDay(context: Context, date: LocalDate): Action =
    actionStartActivity(WidgetLaunch.openApp(context, WidgetLaunch.dayRoute(date)))

/** What TalkBack reads for a day: "Mon, 5 October, 3 events" (or "Free"). */
internal fun daySummary(context: Context, formats: WidgetFormats, day: MonthDay): String {
    val summary = if (day.eventCount == 0) {
        context.getString(R.string.widget_week_free)
    } else {
        eventCountLabel(context, day.eventCount)
    }
    return "${formats.day(day.date)}, $summary"
}

internal val DATE_CIRCLE = 24.dp
internal val CHIP_HEIGHT = 16.dp

/** Days outside the shown period recede, as their dates do. */
private const val FADED_ALPHA = 0.55f
