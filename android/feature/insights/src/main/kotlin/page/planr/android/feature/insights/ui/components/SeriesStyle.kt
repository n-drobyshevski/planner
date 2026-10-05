package page.planr.android.feature.insights.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import page.planr.android.core.model.Category

/** A series key's color (series.ts `seriesMeta`): the category's, or the neutral for Other / No context / unknown. */
@Composable
fun seriesColor(seriesKey: String, categories: Map<String, Category>): Color = TODO("U1")

/** A series key's display name (series.ts `seriesMeta`). */
@Composable
fun seriesName(seriesKey: String, categories: Map<String, Category>): String = TODO("U1")
