package page.planr.android.feature.agenda.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.PlanrTokens
import page.planr.android.core.design.theme.parseHexColor
import page.planr.android.core.model.EventStatus
import page.planr.android.feature.agenda.model.AgendaBlock
import page.planr.android.feature.agenda.model.Ownership

/**
 * How an event block paints (DESIGN.md §5, `eventFillStyle` on the web):
 * mine / shared are solid fills with white ink; the partner's are outlined
 * (tinted fill, colored border and text). Status is never color-only:
 * planned adds a dashed outline, cancelled goes gray with stripes and a
 * strikethrough, inactive recedes to a faint wash.
 */
@Immutable
internal data class BlockStyle(
    val background: Color,
    val border: Color?,
    val content: Color,
    val dashed: Boolean = false,
    val striped: Boolean = false,
    val strikethrough: Boolean = false,
    /** Solid blocks float with a soft warm shadow; outlined / inactive ones sit flat. */
    val raised: Boolean = false,
)

@Composable
internal fun blockStyle(block: AgendaBlock): BlockStyle {
    val dark = PlanrTheme.colors.isDark
    val page = MaterialTheme.colorScheme.background
    val card = PlanrTheme.colors.card
    val cancelled = block.status == EventStatus.Cancelled
    val base = if (cancelled) CancelledGray else parseHexColor(block.color, PlanrTokens.WarmStone)
    // Colored text on the page must stay legible in dark mode.
    val ink = if (dark) lerp(base, Color.White, 0.42f) else base

    return when {
        block.inactive -> BlockStyle(
            background = lerp(card, base, 0.18f),
            border = lerp(MaterialTheme.colorScheme.outlineVariant, base, 0.36f),
            content = MaterialTheme.colorScheme.onSurface,
            striped = cancelled,
            strikethrough = cancelled,
        )
        block.ownership == Ownership.Theirs || block.status == EventStatus.Planned -> BlockStyle(
            background = lerp(page, base, if (dark) 0.2f else 0.12f),
            border = ink,
            content = ink,
            dashed = block.status == EventStatus.Planned,
            striped = cancelled,
            strikethrough = cancelled,
        )
        else -> BlockStyle(
            background = base,
            border = null,
            content = PlanrTheme.colors.memberA.onFill,
            striped = cancelled,
            strikethrough = cancelled,
            raised = !cancelled,
        )
    }
}

/** A neutral warm gray for cancelled blocks (stone-500), the web's grayscale filter. */
private val CancelledGray = Color(0xFF78716C)
