package page.planr.android.feature.quickadd.model

/**
 * Text or a link shared to Quick add from another app (`ACTION_SEND` of
 * `text/plain`), as a prefilled title and notes.
 */
data class SharedText(val title: String, val notes: String) {
    companion object {
        const val TITLE_MAX = 200
        const val NOTES_MAX = 4000

        /**
         * The title is [subject] when there is one (a page's or an email's),
         * else the first non-blank line of [text]; one line, trimmed, at most
         * [TITLE_MAX] characters. The notes are the whole [text], trimmed and
         * at most [NOTES_MAX], unless that is just the title again (a shared
         * link on its own). Null when nothing but whitespace was shared.
         */
        fun parse(subject: String?, text: String?): SharedText? {
            val body = text?.trim().orEmpty()
            val heading = firstLine(subject) ?: firstLine(body) ?: return null
            val title = heading.capped(TITLE_MAX)
            val notes = body.capped(NOTES_MAX).takeUnless { it == title }.orEmpty()
            return SharedText(title, notes)
        }

        private fun firstLine(value: String?): String? =
            value?.lineSequence()?.map { it.trim() }?.firstOrNull { it.isNotEmpty() }

        /** At most [max] characters, never splitting a surrogate pair (an emoji). */
        private fun String.capped(max: Int): String {
            if (length <= max) return this
            val end = if (this[max - 1].isHighSurrogate()) max - 1 else max
            return substring(0, end).trimEnd()
        }
    }
}
