package page.planr.android.widgets

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import page.planr.android.core.design.glance.PlanrGlanceColors

/**
 * Shared widget frame: Planr colours (day/night), the warm-paper surface with
 * soft corners, and a quiet header — [title] on the left, [detail] on the
 * right; tapping it runs [onHeaderClick]. [actions] (buttons) sit at the
 * header's end; with them, only the title is the header's tap target.
 */
@Composable
internal fun WidgetScaffold(
    title: String,
    detail: String? = null,
    onHeaderClick: Action? = null,
    actions: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit = {},
) {
    GlanceTheme(colors = PlanrGlanceColors.scheme) {
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .appWidgetBackground()
                .widgetSurface()
                .padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            WidgetHeader(title, detail, onHeaderClick, actions)
            Spacer(GlanceModifier.height(6.dp))
            content()
        }
    }
}

/** The rounded warm-paper card behind every widget (rounded on every API level). */
@Composable
internal fun GlanceModifier.widgetSurface(): GlanceModifier =
    background(ImageProvider(R.drawable.widget_background), colorFilter = ColorFilter.tint(GlanceTheme.colors.background))
        .cornerRadius(16.dp)

@Composable
private fun WidgetHeader(title: String, detail: String?, onClick: Action?, actions: (@Composable () -> Unit)?) {
    val modifier = GlanceModifier.fillMaxWidth().padding(vertical = 2.dp)
    val rowClick = onClick.takeIf { actions == null }
    val titleClick = onClick.takeIf { actions != null }
    Row(
        modifier = if (rowClick != null) modifier.clickable(rowClick) else modifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val titleModifier = GlanceModifier.defaultWeight()
        Text(
            text = title,
            maxLines = 1,
            style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Medium),
            modifier = if (titleClick != null) titleModifier.clickable(titleClick) else titleModifier,
        )
        if (detail != null) {
            Text(
                text = detail,
                maxLines = 1,
                style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp),
            )
        }
        actions?.invoke()
    }
}

/** A centred message with an optional pill action (empty, signed-out, unavailable). */
@Composable
internal fun WidgetMessage(message: String, actionLabel: String? = null, action: Action? = null) {
    Column(
        modifier = GlanceModifier.fillMaxSize().padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = message,
            maxLines = 3,
            style = TextStyle(
                color = GlanceTheme.colors.onSurfaceVariant,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
            ),
        )
        if (actionLabel != null && action != null) {
            Spacer(GlanceModifier.height(10.dp))
            PillButton(
                label = actionLabel,
                onClick = action,
                fill = GlanceTheme.colors.primary,
                ink = GlanceTheme.colors.onPrimary,
            )
        }
    }
}

/** A compact pill (DESIGN.md's badge/button geometry). */
@Composable
internal fun PillButton(
    label: String,
    onClick: Action,
    fill: ColorProvider,
    ink: ColorProvider,
    modifier: GlanceModifier = GlanceModifier,
) {
    Box(
        modifier = modifier
            .background(ImageProvider(R.drawable.widget_pill), colorFilter = ColorFilter.tint(fill))
            .cornerRadius(999.dp)
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clickable(onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            maxLines = 1,
            style = TextStyle(color = ink, fontSize = 13.sp, fontWeight = FontWeight.Medium),
        )
    }
}

/** The signed-out / unavailable / loading bodies every data widget shares. */
@Composable
internal fun <T> WidgetContentBody(content: WidgetContent<T>, signedOutMessage: String, ready: @Composable (T) -> Unit) {
    val context = LocalContext.current
    when (content) {
        is WidgetContent.Ready -> ready(content.data)
        WidgetContent.SignedOut -> WidgetMessage(
            message = signedOutMessage,
            actionLabel = context.getString(R.string.widget_sign_in),
            action = actionStartActivity(WidgetLaunch.openApp(context)),
        )
        WidgetContent.Unavailable -> WidgetMessage(
            message = context.getString(R.string.widget_unavailable),
            actionLabel = context.getString(R.string.widget_open_app),
            action = actionStartActivity(WidgetLaunch.openApp(context)),
        )
        // A cold start restoring the session: keep the frame quiet for a moment.
        WidgetContent.Loading -> Box(GlanceModifier.fillMaxSize()) {}
    }
}
