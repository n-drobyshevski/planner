package page.planr.android.feature.insights.ui.components

import androidx.compose.runtime.Composable
import java.time.LocalDate
import java.time.ZoneId
import page.planr.android.core.insights.model.DayDetailModel
import page.planr.android.core.model.Category

/** A day's items, as counted by the chart that opened it (day-detail-sheet.tsx). */
@Composable
fun DayDetailSheet(
    model: DayDetailModel,
    categories: Map<String, Category>,
    zone: ZoneId,
    onDismiss: () -> Unit,
    onOpenInCalendar: (LocalDate) -> Unit,
) {
    TODO("U1")
}
