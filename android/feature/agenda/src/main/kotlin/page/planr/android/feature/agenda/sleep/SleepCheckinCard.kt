package page.planr.android.feature.agenda.sleep

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import page.planr.android.core.design.R as DesignR
import page.planr.android.core.design.component.SleepRatingSheet
import page.planr.android.core.design.theme.PlanrRadii
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.TABULAR_NUMS
import page.planr.android.feature.agenda.R
import page.planr.android.feature.agenda.ui.AgendaFormats
import page.planr.android.feature.agenda.ui.AgendaIcons

/**
 * The quiet morning card above the agenda ("How did you sleep? 23:40–07:10")
 * and the rating sheet it opens. Renders nothing while there is nothing to ask.
 */
@Composable
internal fun SleepCheckin(viewModel: SleepCheckinViewModel, formats: AgendaFormats, modifier: Modifier = Modifier) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // Back on the agenda (another app, the Health Connect sheet): reread the nights.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.refresh() }

    state.card?.let { card ->
        SleepCheckinRow(
            card = card,
            formats = formats,
            onOpen = viewModel::openSheet,
            onDismiss = viewModel::dismissCard,
            modifier = modifier,
        )
    }
    state.sheet?.let { sheet ->
        SleepRatingSheet(
            nightLabel = formats.shortDate(sheet.form.date),
            draft = sheet.form.toDraft(),
            fromHealthConnect = sheet.form.fromHealthConnect,
            saving = sheet.saving,
            error = when {
                sheet.timesOutOfOrder -> stringResource(DesignR.string.sleep_rating_times_order)
                sheet.failed -> stringResource(DesignR.string.sleep_rating_save_failed)
                else -> null
            },
            onChange = viewModel::updateDraft,
            onSave = viewModel::save,
            onDismiss = viewModel::closeSheet,
        )
    }
}

@Composable
private fun SleepCheckinRow(
    card: SleepCheckinCard,
    formats: AgendaFormats,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(PlanrRadii.lg)
    Surface(
        color = PlanrTheme.colors.card,
        shape = shape,
        modifier = modifier
            .fillMaxWidth()
            .border(1.dp, PlanrTheme.colors.hairline, shape),
    ) {
        Row(
            Modifier
                .clickable(
                    onClickLabel = stringResource(R.string.agenda_sleep_checkin_open),
                    role = Role.Button,
                    onClick = onOpen,
                )
                .heightIn(min = PlanrSpacing.touchTarget)
                .padding(start = PlanrSpacing.lg),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.md),
        ) {
            Icon(
                AgendaIcons.Sunrise,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp),
            )
            Row(
                Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(PlanrSpacing.sm),
            ) {
                Text(
                    stringResource(R.string.agenda_sleep_checkin_title),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (card.bedtime != null && card.wake != null) {
                    Text(
                        stringResource(R.string.agenda_sleep_checkin_times, formats.time(card.bedtime), formats.time(card.wake)),
                        style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = TABULAR_NUMS),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                }
            }
            IconButton(onClick = onDismiss) {
                Icon(
                    AgendaIcons.Close,
                    contentDescription = stringResource(R.string.agenda_sleep_checkin_dismiss),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}
