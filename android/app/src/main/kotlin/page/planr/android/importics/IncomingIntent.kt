package page.planr.android.importics

/**
 * What an intent delivered to MainActivity asks for. Decided from plain
 * strings so the routing is unit-testable without Android.
 */
internal sealed interface IncomingIntent {
    /** The OAuth App Link (`https://…/app/auth/callback?code=…`). */
    data class AuthCallback(val url: String) : IncomingIntent

    /** A widget tap with its (untrusted) route. */
    data class WidgetOpen(val route: String?) : IncomingIntent

    /** An .ics file to read, by its `content:` or `file:` URI. */
    data class IcsFile(val uri: String) : IncomingIntent

    /** An .ics calendar shared as text. */
    data class IcsText(val text: String) : IncomingIntent

    companion object {
        const val ACTION_VIEW = "android.intent.action.VIEW"
        const val ACTION_SEND = "android.intent.action.SEND"

        private val FILE_SCHEMES = setOf("content", "file")

        /**
         * Classifies an intent: [data] is its data URI, [stream] its
         * `EXTRA_STREAM` URI and [text] its `EXTRA_TEXT` (SEND), [widgetAction]
         * the widgets' open action. Null when it asks for nothing we handle.
         *
         * A VIEW of an `https` link stays the sign-in callback; a VIEW of a
         * `content:` / `file:` URI is a file to import. A SEND carries the file
         * as a stream, or the calendar itself as text.
         */
        fun classify(
            action: String?,
            data: String?,
            stream: String?,
            text: String?,
            widgetAction: String,
            widgetRoute: String?,
        ): IncomingIntent? = when (action) {
            ACTION_VIEW -> when (schemeOf(data)) {
                "https" -> AuthCallback(data!!)
                in FILE_SCHEMES -> IcsFile(data!!)
                else -> null
            }
            ACTION_SEND -> when {
                schemeOf(stream) in FILE_SCHEMES -> IcsFile(stream!!)
                text != null && text.contains("BEGIN:VCALENDAR", ignoreCase = true) -> IcsText(text)
                else -> null
            }
            widgetAction -> WidgetOpen(widgetRoute)
            else -> null
        }

        /** The URI's scheme, lower-cased; null without one. */
        private fun schemeOf(uri: String?): String? {
            val colon = uri?.indexOf(':') ?: return null
            if (colon <= 0) return null
            val scheme = uri.substring(0, colon)
            val valid = scheme[0].isLetter() && scheme.all { it.isLetterOrDigit() || it in "+-." }
            return if (valid) scheme.lowercase() else null
        }
    }
}
