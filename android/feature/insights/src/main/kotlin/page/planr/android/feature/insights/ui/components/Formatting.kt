package page.planr.android.feature.insights.ui.components

import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import page.planr.android.core.design.theme.GeistMonoFamily
import page.planr.android.core.insights.labels.DurationFormat
import page.planr.android.core.insights.labels.LabelLocale

/** The labels' locale from the configuration: "ru" → Ru, else En. */
@Composable
fun rememberLabelLocale(): LabelLocale {
    val language = LocalConfiguration.current.locales[0]?.language
    return remember(language) { if (language == "ru") LabelLocale.Ru else LabelLocale.En }
}

/** DurationFormat.format in the current label locale. */
@Composable
fun durationText(ms: Double): String {
    val locale = rememberLabelLocale()
    return remember(ms, locale) { DurationFormat.format(ms, locale) }
}

/** Animator duration scale 0: nothing animates. */
@Composable
fun rememberReducedMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    return remember(resolver) {
        Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
}

/** Renders ▲ ▼ ○ in Geist Mono (Manrope, the ru UI face, has none of them); everything else in the ambient style. */
@Composable
fun rememberGlyphText(text: String): AnnotatedString = remember(text) { glyphText(text) }

/** The glyphs Manrope lacks (Geist Mono and Plus Jakarta have them). */
private const val GLYPHS = "▲▼○"

private val GlyphStyle = SpanStyle(fontFamily = GeistMonoFamily)

internal fun glyphText(text: String): AnnotatedString = buildAnnotatedString {
    var start = 0
    for (i in text.indices) {
        if (text[i] in GLYPHS) {
            append(text, start, i)
            withStyle(GlyphStyle) { append(text[i]) }
            start = i + 1
        }
    }
    append(text, start, text.length)
}
