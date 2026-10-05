package page.planr.android.core.design.component

import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.PlanrTokens

/**
 * The screens' floating button (Quick add), in the one warm-stone accent.
 *
 * Material's FAB casts a neutral black shadow; DESIGN.md's Warm-Shadow Rule
 * wants every shadow tinted stone (`rgb(28 25 23)`), so the built-in
 * elevation is turned off and a "Soft Large" shadow — the vocabulary for
 * things that genuinely float — is drawn in ShadowStone instead.
 */
@Composable
fun PlanrFloatingButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val shape = FloatingActionButtonDefaults.shape
    val shadow = PlanrTokens.ShadowStone.copy(alpha = SHADOW_ALPHA)
    FloatingActionButton(
        onClick = onClick,
        modifier = modifier.shadow(SHADOW_ELEVATION, shape, ambientColor = shadow, spotColor = shadow),
        shape = shape,
        containerColor = MaterialTheme.colorScheme.primary,
        contentColor = MaterialTheme.colorScheme.onPrimary,
        elevation = FloatingActionButtonDefaults.elevation(0.dp, 0.dp, 0.dp, 0.dp),
        content = content,
    )
}

private val SHADOW_ELEVATION = 6.dp
private const val SHADOW_ALPHA = 0.3f
