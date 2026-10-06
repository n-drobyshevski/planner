package page.planr.android.feature.agenda.model

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow

/**
 * A result message for the agenda's snackbar, optionally with an Undo that
 * reverses exactly that write (the web's toast + `undoById`). [failedWrite]
 * marks a write that didn't go through, which the snackbar backs with a
 * reject haptic.
 */
data class AgendaNotice(
    val message: UiText,
    val failedWrite: Boolean = false,
    val undo: (suspend () -> Unit)? = null,
)

/**
 * Hands notices from the detail / editor screens to the agenda, which is the
 * screen they return to. Each notice is delivered once, to whoever collects.
 */
@Singleton
class AgendaNotices @Inject constructor() {
    private val channel = Channel<AgendaNotice>(capacity = 8, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    val notices: Flow<AgendaNotice> = channel.receiveAsFlow()

    fun post(notice: AgendaNotice) {
        channel.trySend(notice)
    }
}
