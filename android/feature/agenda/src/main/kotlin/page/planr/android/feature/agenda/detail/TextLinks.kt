package page.planr.android.feature.agenda.detail

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.LinkInteractionListener
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString

/** A tappable span of plain text: [start] inclusive, [end] exclusive, and where it goes. */
data class TextLink(val start: Int, val end: Int, val target: String)

/**
 * Finds the links in free text (an event's notes or location): web addresses
 * (`http(s)://…` and `www.…`), email addresses and phone numbers. Deliberately
 * conservative, since a wrong link is worse than none: a phone number needs 7
 * to 15 digits, and an ISO date (2026-10-06) or a spaced amount
 * (1 500 000) is never one. Earlier kinds
 * win where they overlap, so the digits or `@` inside a URL stay part of it.
 */
object TextLinks {
    private val WEB = Regex("""(?i)\b(?:https?://|www\.)[^\s<>"]+""")
    private val EMAIL = Regex("""(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b""")
    private val PHONE = Regex("""(?<![\w+])\+?\(?\d[\d  ()-]{5,}\d(?![\w])""")
    private val ISO_DATE = Regex("""\d{4}-\d{2}-\d{2}""")
    private val THOUSANDS = Regex("""\d{1,3}(?:[ \u00A0]\d{3})+""")

    /** Trailing characters that end a sentence rather than the address. */
    private const val TRAILING = ".,;:!?'\"]}>"

    fun find(text: String): List<TextLink> {
        val links = mutableListOf<TextLink>()
        fun overlaps(range: IntRange) = links.any { range.first < it.end && it.start <= range.last }

        WEB.findAll(text).forEach { match ->
            val raw = trimTrailing(match.value)
            if (raw.substringAfter("://").removePrefix("www.").isEmpty()) return@forEach
            val target = if (raw.startsWith("www.", ignoreCase = true)) "https://$raw" else raw
            links += TextLink(match.range.first, match.range.first + raw.length, target)
        }
        EMAIL.findAll(text).forEach { match ->
            if (!overlaps(match.range)) links += TextLink(match.range.first, match.range.last + 1, "mailto:${match.value}")
        }
        PHONE.findAll(text).forEach { match ->
            val raw = match.value.trimEnd(')', ' ', ' ', '-')
            val range = match.range.first until match.range.first + raw.length
            val digits = raw.count(Char::isDigit)
            if (digits !in 7..15 || ISO_DATE.matches(raw) || THOUSANDS.matches(raw) || overlaps(range)) return@forEach
            val dial = (if (raw.startsWith("+")) "+" else "") + raw.filter(Char::isDigit)
            links += TextLink(range.first, range.last + 1, "tel:$dial")
        }
        return links.sortedBy { it.start }
    }

    /** The first web address in [text], as [find] would link it; null when there is none. */
    fun firstWebLink(text: String): String? =
        find(text).firstOrNull { it.target.startsWith("http", ignoreCase = true) }?.target

    /**
     * [text] with each of [find]'s links as a [LinkAnnotation.Url] in [styles].
     * [listener] handles taps (null: the platform's default URI handler).
     */
    fun annotate(text: String, styles: TextLinkStyles? = null, listener: LinkInteractionListener? = null): AnnotatedString =
        buildAnnotatedString {
            append(text)
            find(text).forEach { link ->
                addLink(LinkAnnotation.Url(link.target, styles, listener), link.start, link.end)
            }
        }

    /** Drops sentence punctuation after an address, and a `)` it didn't open. */
    private fun trimTrailing(value: String): String {
        var end = value.length
        while (end > 0) {
            val c = value[end - 1]
            val unbalancedParen = c == ')' && value.take(end).count { it == '(' } < value.take(end).count { it == ')' }
            if (c in TRAILING || unbalancedParen) end-- else break
        }
        return value.substring(0, end)
    }
}

/** Where tapping an event's location goes. */
sealed interface LocationTarget {
    /** A video-call or other web link written as the location. */
    data class Web(val url: String) : LocationTarget

    /** A place to look up in a maps app (`geo:0,0?q=`[query]). */
    data class Place(val query: String) : LocationTarget

    companion object {
        fun of(location: String): LocationTarget {
            val trimmed = location.trim()
            return TextLinks.firstWebLink(trimmed)?.let(::Web) ?: Place(trimmed)
        }
    }
}
