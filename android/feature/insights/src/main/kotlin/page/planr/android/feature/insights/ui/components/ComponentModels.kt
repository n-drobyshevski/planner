package page.planr.android.feature.insights.ui.components

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/** A lead figure under a lede: label, value and an optional hint. */
@Immutable
data class LeadFigure(val label: String, val value: String, val hint: String? = null)

/** A series legend chip. */
@Immutable
data class LegendItem(val key: String, val label: String, val color: Color)
