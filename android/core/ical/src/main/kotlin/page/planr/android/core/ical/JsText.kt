package page.planr.android.core.ical

/**
 * JS string semantics the port relies on. `String.prototype.trim` and the
 * regex class `\s` share one whitespace set, which differs from Kotlin's
 * `Char.isWhitespace` (JS includes U+FEFF, and excludes U+001C–U+001F).
 */
internal const val JS_WHITESPACE =
    "\t\n\u000B\u000C\r \u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A" +
        "\u2028\u2029\u202F\u205F\u3000\uFEFF"

internal fun isJsWhitespace(c: Char): Boolean = JS_WHITESPACE.indexOf(c) >= 0

/** `String.prototype.trim`. */
internal fun jsTrim(text: String): String = text.trim(::isJsWhitespace)

/** JS `/\s+/g`. */
internal val JS_WHITESPACE_RUN = Regex("[" + JS_WHITESPACE.map { "\\u%04X".format(java.util.Locale.ROOT, it.code) }.joinToString("") + "]+")
