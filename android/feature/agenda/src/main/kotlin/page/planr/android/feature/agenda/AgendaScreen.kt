package page.planr.android.feature.agenda

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import page.planr.android.core.design.component.PlaceholderScreen

/**
 * Day/week agenda for both members. Placeholder until Phase 4.
 *
 * @param onOpenEvent opens an occurrence's event detail (by event id).
 */
@Composable
fun AgendaScreen(
    onOpenEvent: (eventId: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    PlaceholderScreen(
        title = stringResource(R.string.agenda_empty_title),
        body = stringResource(R.string.agenda_empty_body),
        modifier = modifier,
    )
}
