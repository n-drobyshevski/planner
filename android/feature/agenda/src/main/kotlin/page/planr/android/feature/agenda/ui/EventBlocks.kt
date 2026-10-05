package page.planr.android.feature.agenda.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.datetime.TimeZone
import page.planr.android.core.design.theme.EventBlockShape
import page.planr.android.core.design.theme.PlanrRadii
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.PlanrTokens
import page.planr.android.core.design.theme.parseHexColor
import page.planr.android.core.model.EventStatus
import page.planr.android.feature.agenda.R
import page.planr.android.feature.agenda.model.AgendaBlock
import page.planr.android.feature.agenda.model.Ownership

/**
 * A timed block in a day column. [height] decides how much fits: the title
 * always, then the time range, then the context hint. [compact] (week view)
 * shows the title alone.
 */
@Composable
internal fun TimedEventBlock(
    block: AgendaBlock,
    zone: TimeZone,
    height: Dp,
    compact: Boolean,
    formats: AgendaFormats,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val style = blockStyle(block)
    val title = block.title.ifBlank { stringResource(R.string.agenda_untitled) }
    val range = stringResource(
        R.string.agenda_block_time_range,
        formats.time(block.start, zone),
        formats.time(block.end, zone),
    )
    val description = blockDescription(block, title, range)
    BlockSurface(
        style = style,
        shape = EventBlockShape,
        modifier = modifier
            .semantics { contentDescription = description }
            .clickable(role = Role.Button, onClick = onClick),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = if (compact) 3.dp else 6.dp, vertical = 3.dp),
            verticalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            Row(verticalAlignment = Alignment.Top) {
                Text(
                    text = title,
                    color = style.content,
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontSize = if (compact) 11.sp else 12.sp,
                        lineHeight = if (compact) 13.sp else 15.sp,
                    ),
                    textDecoration = if (style.strikethrough) TextDecoration.LineThrough else null,
                    maxLines = maxTitleLines(height, compact),
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (block.ownership == Ownership.Shared && !compact) {
                    Spacer(Modifier.width(4.dp))
                    Icon(AgendaIcons.Users, contentDescription = null, tint = style.content, modifier = Modifier.size(11.dp))
                }
            }
            if (!compact && height >= 40.dp) {
                Text(
                    text = "${formats.time(block.start, zone)} – ${formats.time(block.end, zone)}",
                    color = style.content.copy(alpha = 0.85f),
                    style = PlanrTheme.type.time,
                    maxLines = 1,
                )
            }
            if (!compact && height >= 58.dp && block.categoryName != null) {
                CategoryHint(block.categoryName, block.categoryColor, style)
            }
        }
    }
}

/** DESIGN.md's minimum touch target on mobile (2.75rem). */
internal val MinTouchTarget = 44.dp

/**
 * A one-line all-day chip. With [onClick] it is its own button, padded to
 * the 44dp touch minimum (DESIGN.md) around the compact chip; without, it is
 * just its label inside a larger target (the week view's day cell).
 */
@Composable
internal fun AllDayChip(block: AgendaBlock, onClick: (() -> Unit)?, modifier: Modifier = Modifier) {
    val style = blockStyle(block)
    val title = block.title.ifBlank { stringResource(R.string.agenda_untitled) }
    val description = blockDescription(block, title, stringResource(R.string.agenda_all_day))
    val target = if (onClick != null) {
        Modifier
            .heightIn(min = MinTouchTarget)
            .clickable(role = Role.Button, onClick = onClick)
    } else {
        Modifier
    }
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .fillMaxWidth()
            .then(target)
            .semantics { contentDescription = description },
    ) {
        AllDayChipSurface(style, title)
    }
}

@Composable
private fun AllDayChipSurface(style: BlockStyle, title: String) {
    BlockSurface(
        style = style,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(PlanrRadii.sm),
        modifier = Modifier
            .fillMaxWidth()
            .height(22.dp),
    ) {
        Text(
            text = title,
            color = style.content,
            style = MaterialTheme.typography.labelSmall,
            textDecoration = if (style.strikethrough) TextDecoration.LineThrough else null,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .align(Alignment.CenterStart)
                .padding(horizontal = 6.dp),
        )
    }
}

/** A context's time-block: a faint wash of its color behind the events, labelled at the top. */
@Composable
internal fun ContextBackdrop(block: AgendaBlock, showLabel: Boolean, modifier: Modifier = Modifier) {
    val color = parseHexColor(block.color, PlanrTokens.WarmStone)
    Box(
        modifier = modifier
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(PlanrRadii.sm))
            .background(color.copy(alpha = if (PlanrTheme.colors.isDark) 0.14f else 0.08f)),
    ) {
        if (showLabel) {
            Text(
                text = block.title,
                color = color.copy(alpha = 0.9f),
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Medium),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
            )
        }
    }
}

@Composable
private fun CategoryHint(name: String, hex: String?, style: BlockStyle) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (hex != null && style.border != null) {
            Box(
                Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(parseHexColor(hex, style.content)),
            )
            Spacer(Modifier.width(4.dp))
        }
        Text(
            text = name,
            color = style.content.copy(alpha = 0.85f),
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Paints [style]: fill, solid or dashed border, cancelled stripes, soft shadow. */
@Composable
private fun BlockSurface(
    style: BlockStyle,
    shape: Shape,
    modifier: Modifier = Modifier,
    content: @Composable androidx.compose.foundation.layout.BoxScope.() -> Unit,
) {
    val shadowColor = PlanrTokens.ShadowStone.copy(alpha = 0.18f)
    val stripe = style.content.copy(alpha = 0.18f)
    Box(
        modifier = modifier
            .then(if (style.raised) Modifier.shadow(1.dp, shape, ambientColor = shadowColor, spotColor = shadowColor) else Modifier)
            .clip(shape)
            .background(style.background)
            .then(
                when {
                    style.border == null -> Modifier
                    style.dashed -> Modifier.drawBehind {
                        val w = 1.5.dp.toPx()
                        drawRoundRect(
                            color = style.border,
                            topLeft = Offset(w / 2, w / 2),
                            size = size.copy(width = size.width - w, height = size.height - w),
                            cornerRadius = CornerRadius(PlanrRadii.md.toPx()),
                            style = Stroke(width = w, pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 3.dp.toPx()))),
                        )
                    }
                    else -> Modifier.border(1.5.dp, style.border, shape)
                },
            )
            .then(
                if (style.striped) {
                    Modifier.drawWithContent {
                        drawContent()
                        val step = 8.dp.toPx()
                        clipRect {
                            var x = -size.height
                            while (x < size.width) {
                                drawLine(stripe, Offset(x, size.height), Offset(x + size.height, 0f), strokeWidth = 1.dp.toPx())
                                x += step
                            }
                        }
                    }
                } else {
                    Modifier
                },
            ),
        content = content,
    )
}

/** Screen-reader text: title, when, and whose / what state (calendar.block.readState). */
@Composable
private fun blockDescription(block: AgendaBlock, title: String, whenText: String): String {
    val states = buildList {
        if (block.ownership == Ownership.Shared) add(stringResource(R.string.agenda_block_shared))
        if (block.ownership == Ownership.Theirs) add(stringResource(R.string.agenda_block_readonly))
        if (block.status == EventStatus.Cancelled) add(stringResource(R.string.agenda_block_cancelled))
        if (block.status == EventStatus.Planned) add(stringResource(R.string.agenda_block_planned))
    }
    return (listOf(title, whenText) + states).joinToString(", ")
}

private fun maxTitleLines(height: Dp, compact: Boolean): Int = when {
    compact -> ((height.value - 6f) / 13f).toInt().coerceAtLeast(1)
    height < 40.dp -> 1
    else -> 2
}
