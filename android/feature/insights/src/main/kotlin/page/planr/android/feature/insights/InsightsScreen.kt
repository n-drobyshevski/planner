package page.planr.android.feature.insights

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kotlinx.datetime.LocalDate

/**
 * The Insights screen: header, tab row, period bar and the active tab's
 * content. The shell appends a trailing, defaulted ViewModel parameter.
 */
@Composable
fun InsightsScreen(
    onOpenDay: (LocalDate) -> Unit,
    onOpenAgenda: () -> Unit,
    onOpenTasks: () -> Unit,
    accountAction: (@Composable () -> Unit)?,
    modifier: Modifier = Modifier,
) {
    TODO("S1")
}
