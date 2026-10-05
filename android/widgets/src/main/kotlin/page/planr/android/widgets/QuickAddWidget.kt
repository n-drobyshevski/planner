package page.planr.android.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Row
import androidx.glance.layout.RowScope
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.layout.width
import page.planr.android.core.design.glance.PlanrGlanceColors
import page.planr.android.feature.quickadd.QuickAddActivity
import page.planr.android.feature.quickadd.QuickAddKind

/**
 * Two buttons, Task and Event, that open the Quick add sheet over the home
 * screen ([QuickAddActivity], a translucent activity in :feature:quickadd).
 * Static: no data, no sign-in state (the sheet handles a signed-out user).
 */
class QuickAddWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            GlanceTheme(colors = PlanrGlanceColors.scheme) {
                QuickAddContent()
            }
        }
    }
}

@Composable
private fun QuickAddContent() {
    val context = LocalContext.current
    Row(
        modifier = GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .widgetSurface()
            // Little vertical padding: a pill (~33dp) must fit the 40dp one-row minimum.
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        QuickAddButton(context.getString(R.string.widget_quickadd_task), QuickAddKind.Task)
        Spacer(GlanceModifier.width(8.dp))
        QuickAddButton(context.getString(R.string.widget_quickadd_event), QuickAddKind.Event)
    }
}

@Composable
private fun RowScope.QuickAddButton(label: String, kind: QuickAddKind) {
    val context = LocalContext.current
    PillButton(
        label = label,
        onClick = actionStartActivity(QuickAddActivity.intent(context, kind)),
        // Task, the more frequent one, carries the single accent.
        fill = if (kind == QuickAddKind.Task) GlanceTheme.colors.primary else GlanceTheme.colors.secondaryContainer,
        ink = if (kind == QuickAddKind.Task) GlanceTheme.colors.onPrimary else GlanceTheme.colors.onSecondaryContainer,
        modifier = GlanceModifier.defaultWeight(),
    )
}

class QuickAddWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = QuickAddWidget()
}
