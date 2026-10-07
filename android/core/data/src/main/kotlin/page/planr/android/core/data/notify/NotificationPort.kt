package page.planr.android.core.data.notify

import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.datetime.LocalDate

/** The opt-in notifications' channels. */
enum class NotifyChannel {
    /** "Time requests": default importance. */
    TimeRequests,

    /** "Partner's changes": low importance, no sound. */
    PartnerChanges,
}

/** Where tapping a notification opens the app. */
sealed interface NotifyTarget {
    data object Inbox : NotifyTarget

    /** The agenda's day view on [date]. */
    data class Day(val date: LocalDate) : NotifyTarget
}

/**
 * One notification, as built here and posted by the app. [title] is short
 * (it shows on one line); [text] wraps when expanded. [lines] (at most five) are
 * shown expanded under [title], with "+[more]" when some were left out;
 * [id] replaces a notification posted under the same id.
 */
data class NotifyContent(
    val channel: NotifyChannel,
    val id: Int,
    val title: String,
    val text: String,
    val lines: List<String> = emptyList(),
    val more: Int = 0,
    val target: NotifyTarget,
)

/** The platform's notifications, as the notifiers see them. The app implements it; tests use a fake. */
interface NotificationPort {
    /** False while [channel] can't show: the app's notifications blocked, or just that channel turned off. */
    fun canPost(channel: NotifyChannel): Boolean

    /** Creates (or renames, after a language change) [channel]; safe to call any time. */
    fun ensureChannel(channel: NotifyChannel)

    fun post(content: NotifyContent)

    /** Takes down every notification of [channel] still showing (sign-out). */
    fun cancelAll(channel: NotifyChannel)
}

/** Whether the app is on screen: nothing is notified then (the badge and the live agenda show it). */
fun interface AppForeground {
    fun isForeground(): Boolean

    /**
     * Emits each time the app comes to the foreground, even for a visit no
     * change or check falls in (by default never: a fixed answer has no entries).
     */
    fun entries(): Flow<Unit> = emptyFlow()
}

/** The process lifecycle: in the foreground from STARTED on, as [page.planr.android.core.data.sync.SyncWorker] reads it. */
class ProcessAppForeground @Inject constructor() : AppForeground {
    private val state get() = ProcessLifecycleOwner.get().lifecycle.currentStateFlow

    override fun isForeground(): Boolean = state.value.isAtLeast(Lifecycle.State.STARTED)

    override fun entries(): Flow<Unit> =
        state.map { it.isAtLeast(Lifecycle.State.STARTED) }.distinctUntilChanged().filter { it }.map { }
}
