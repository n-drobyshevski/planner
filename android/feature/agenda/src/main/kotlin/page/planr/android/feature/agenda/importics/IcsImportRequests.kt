package page.planr.android.feature.agenda.importics

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.getAndUpdate

/**
 * The text of an .ics file waiting for the import review: the app reads the
 * file (opened from another app, shared to Planr, or picked in the account
 * menu) and offers it here; the review screen claims it once. Only the latest
 * file is kept. In memory only: a file never outlives the process.
 */
@Singleton
class IcsImportRequests @Inject constructor() {
    private val pending = MutableStateFlow<String?>(null)

    fun offer(text: String) {
        pending.value = text
    }

    /** Claims the pending file's text (null when there is none), so it is reviewed once. */
    fun take(): String? = pending.getAndUpdate { null }

    companion object {
        /** The largest file read for import; a calendar export of years of events is well under it. */
        const val MAX_BYTES = 5L * 1024 * 1024
    }
}
