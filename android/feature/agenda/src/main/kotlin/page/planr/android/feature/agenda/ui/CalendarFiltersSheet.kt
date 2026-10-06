package page.planr.android.feature.agenda.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.PlanrTokens
import page.planr.android.core.design.theme.parseHexColor
import page.planr.android.feature.agenda.CalendarFilters
import page.planr.android.feature.agenda.PartnerToggle
import page.planr.android.feature.agenda.R

/**
 * The top bar's filter button. A small dot marks it while the own calendar
 * or a context is hidden, so a sparse agenda never reads as an empty one.
 */
@Composable
internal fun CalendarFiltersButton(narrowed: Boolean, onClick: () -> Unit) {
    val description = stringResource(if (narrowed) R.string.agenda_filters_hidden else R.string.agenda_filters)
    IconButton(onClick = onClick, modifier = Modifier.semantics { contentDescription = description }) {
        BadgedBox(
            badge = {
                if (narrowed) {
                    Badge(
                        containerColor = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.clearAndSetSemantics {},
                    )
                }
            },
        ) {
            Icon(AgendaIcons.SlidersHorizontal, contentDescription = null, modifier = Modifier.size(20.dp))
        }
    }
}

/**
 * Which calendars and contexts the agenda shows: the web calendar's filter
 * sheet (calendar-filters-sheet.tsx) — my calendar, the other member's, then
 * every context with "Show all". Changes apply at once.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CalendarFiltersSheet(
    filters: CalendarFilters,
    partner: PartnerToggle?,
    onOwnShown: (Boolean) -> Unit,
    onPartnerShown: (Boolean) -> Unit,
    onContextShown: (id: String, shown: Boolean) -> Unit,
    onShowAllContexts: () -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = PlanrTheme.colors.card,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = PlanrSpacing.xl)
                .padding(bottom = PlanrSpacing.xl)
                .navigationBarsPadding(),
        ) {
            Text(
                stringResource(R.string.agenda_filters),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                stringResource(R.string.agenda_filters_description),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = PlanrSpacing.xs),
            )
            filters.own?.let { own ->
                SectionHeading(stringResource(R.string.agenda_filters_my_calendar))
                FilterRow(
                    name = own.name,
                    dot = memberInk(own.color, own.isMemberA),
                    shown = own.shown,
                    onShown = onOwnShown,
                )
            }
            if (partner != null) {
                SectionHeading(stringResource(R.string.agenda_filters_other_calendars))
                FilterRow(
                    name = partner.name,
                    dot = memberInk(partner.color, partner.isMemberA),
                    shown = partner.shown,
                    onShown = onPartnerShown,
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                SectionHeading(stringResource(R.string.agenda_filters_contexts), Modifier.weight(1f))
                if (filters.contexts.any { !it.shown }) {
                    TextButton(onClick = onShowAllContexts, modifier = Modifier.padding(top = PlanrSpacing.md)) {
                        Text(stringResource(R.string.agenda_filters_show_all))
                    }
                }
            }
            if (filters.contexts.isEmpty()) {
                Text(
                    stringResource(R.string.agenda_filters_no_contexts),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = PlanrSpacing.sm),
                )
            }
            filters.contexts.forEach { context ->
                FilterRow(
                    name = context.name,
                    dot = ink(parseHexColor(context.color, PlanrTokens.WarmStone)),
                    shown = context.shown,
                    onShown = { onContextShown(context.id, it) },
                    shared = context.shared,
                )
            }
        }
    }
}

@Composable
private fun SectionHeading(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier
            .padding(top = PlanrSpacing.xl, bottom = PlanrSpacing.xs)
            .semantics { heading() },
    )
}

/** A calendar or context: colour dot, name, a joint context's people mark, checkbox (checked = shown). */
@Composable
private fun FilterRow(name: String, dot: Color, shown: Boolean, onShown: (Boolean) -> Unit, shared: Boolean = false) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .toggleable(value = shown, role = Role.Checkbox, onValueChange = onShown),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.lg),
    ) {
        Box(
            Modifier
                .size(10.dp)
                .background(dot, CircleShape),
        )
        Row(
            Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
        ) {
            Text(
                name,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            if (shared) {
                Icon(
                    AgendaIcons.Users,
                    contentDescription = stringResource(R.string.agenda_filters_shared_context),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(14.dp),
                )
            }
        }
        Checkbox(checked = shown, onCheckedChange = null)
    }
}

/** A member's identity colour, else their slot's default. */
@Composable
private fun memberInk(hex: String?, isMemberA: Boolean): Color {
    val slot = if (isMemberA) PlanrTheme.colors.memberA else PlanrTheme.colors.memberB
    return ink(parseHexColor(hex, slot.fill))
}

/** Lightened on dark surfaces (the agenda's ink rule). */
@Composable
private fun ink(base: Color): Color = if (PlanrTheme.colors.isDark) lerp(base, Color.White, 0.42f) else base
