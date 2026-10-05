package page.planr.android.feature.insights.shell

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.PlanrRadii
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.feature.insights.R
import page.planr.android.feature.insights.ui.chart.ChartHeights
import page.planr.android.feature.insights.ui.components.rememberReducedMotion

/**
 * The loading skeleton (insights-tab-skeleton.tsx): four stat placeholders and
 * two chart blocks, flat in surfaceContainer. A slow alpha pulse, static with
 * reduced motion; no shimmer. Hidden from TalkBack.
 */
@Composable
internal fun InsightsSkeleton(modifier: Modifier = Modifier) {
    val pulse = if (rememberReducedMotion()) null else rememberPulse()
    Column(
        modifier
            .fillMaxWidth()
            .graphicsLayer { alpha = pulse?.invoke() ?: 1f }
            .clearAndSetSemantics {},
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.xl),
    ) {
        repeat(2) {
            Row(horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.xl)) {
                Placeholder(56.dp, Modifier.weight(1f))
                Placeholder(56.dp, Modifier.weight(1f))
            }
        }
        Placeholder(ChartHeights.Compact, Modifier.fillMaxWidth(), RoundedCornerShape(PlanrRadii.xl))
        Placeholder(ChartHeights.Standard, Modifier.fillMaxWidth(), RoundedCornerShape(PlanrRadii.xl))
    }
}

/** A 1.2 s alpha cycle, read in the draw phase only. */
@Composable
private fun rememberPulse(): () -> Float {
    val transition = rememberInfiniteTransition(label = "skeleton")
    val alpha = transition.animateFloat(
        initialValue = 1f,
        targetValue = 0.5f,
        animationSpec = infiniteRepeatable(tween(PULSE_HALF_MS), RepeatMode.Reverse),
        label = "skeleton-alpha",
    )
    return { alpha.value }
}

@Composable
private fun Placeholder(height: Dp, modifier: Modifier = Modifier, shape: RoundedCornerShape = RoundedCornerShape(PlanrRadii.lg)) {
    Box(
        modifier
            .height(height)
            .background(MaterialTheme.colorScheme.surfaceContainer.copy(alpha = 0.6f), shape),
    )
}

/** The first load failed and nothing is cached (nav.json loadError). */
@Composable
internal fun LoadError(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier
            .fillMaxWidth()
            .padding(vertical = 32.dp, horizontal = PlanrSpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
    ) {
        Text(
            stringResource(R.string.insights_shell_load_error_title),
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
        )
        Text(
            stringResource(R.string.insights_shell_load_error_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        OutlinedButton(onClick = onRetry, modifier = Modifier.padding(top = PlanrSpacing.sm)) {
            Text(stringResource(R.string.insights_shell_retry))
        }
    }
}

/** A custom range longer than 366 days was cut to the most recent 366. Not dismissible. */
@Composable
internal fun ClampBanner(modifier: Modifier = Modifier) {
    Strip(modifier) {
        Icon(
            ShellIcons.Info,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(16.dp),
        )
        Text(
            stringResource(R.string.insights_shell_clamped),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** The last refresh failed; the numbers come from the cache. */
@Composable
internal fun RefreshFailedBanner(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Strip(modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
        Text(
            stringResource(R.string.insights_shell_load_error_inline),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = onRetry) { Text(stringResource(R.string.insights_shell_retry)) }
    }
}

@Composable
private fun Strip(modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) {
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 36.dp)
            .background(MaterialTheme.colorScheme.surfaceContainer, RoundedCornerShape(PlanrRadii.lg))
            .padding(horizontal = PlanrSpacing.lg, vertical = PlanrSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
        content = content,
    )
}

private const val PULSE_HALF_MS = 600
