package page.planr.android.feature.insights.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.text.AnnotatedString
import page.planr.android.core.insights.labels.LabelLocale

/** The labels' locale from the configuration: "ru" → Ru, else En. */
@Composable
fun rememberLabelLocale(): LabelLocale = TODO("U1")

/** DurationFormat.format in the current label locale. */
@Composable
fun durationText(ms: Double): String = TODO("U1")

/** Animator duration scale 0: nothing animates. */
@Composable
fun rememberReducedMotion(): Boolean = TODO("U1")

/** Renders ▲ ▼ ○ in Geist Mono (Manrope, the ru UI face, has none of them); everything else in the ambient style. */
@Composable
fun rememberGlyphText(text: String): AnnotatedString = TODO("U1")
