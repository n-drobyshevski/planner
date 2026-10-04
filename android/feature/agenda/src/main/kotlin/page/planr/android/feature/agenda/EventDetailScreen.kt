package page.planr.android.feature.agenda

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import page.planr.android.core.design.component.PlaceholderScreen

/** Event detail/edit, incl. this / following / all for recurring. Placeholder. */
@Composable
fun EventDetailScreen(
    eventId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    PlaceholderScreen(
        title = stringResource(R.string.event_detail_title),
        body = eventId,
        modifier = modifier,
    )
}
