package page.planr.android.core.data.repository

import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Clock
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.model.TimeslotRequest
import page.planr.android.core.data.model.TimeslotRequestStatus
import page.planr.android.core.data.remote.TimeslotRequestsRemote

/**
 * The signed-in member's pending public-share timeslot requests, for the
 * Inbox. Read from the server on demand and kept in memory, like the web's
 * query cache; nothing is cached on disk.
 */
interface TimeslotRequestRepository {
    /** Pending requests, newest first; null until the first [refresh] for this member landed. */
    val pending: Flow<List<TimeslotRequest>?>

    /** Refetches [pending]. Throws when offline. */
    suspend fun refresh()

    /**
     * Marks the request approved. It leaves [pending] at once; when the
     * write fails it comes back and the failure is rethrown. Creating the
     * event is the caller's job (the web's `markApproved`).
     */
    suspend fun markApproved(id: String)

    /** Marks the request declined; optimistic like [markApproved]. */
    suspend fun markDeclined(id: String)
}

@Singleton
class RemoteTimeslotRequestRepository @Inject constructor(
    private val remote: TimeslotRequestsRemote,
    private val session: SessionManager,
    private val clock: Clock,
) : TimeslotRequestRepository {

    private data class Cached(val memberId: String, val requests: List<TimeslotRequest>)

    private val cache = MutableStateFlow<Cached?>(null)

    /**
     * Requests being resolved or resolved on this device. A read that was
     * sent before a resolve landed would otherwise bring the row back.
     */
    private val settled = MutableStateFlow<Set<String>>(emptySet())

    private val memberId: Flow<String?> =
        session.authState.map { (it as? AuthState.SignedIn)?.session?.memberId }.distinctUntilChanged()

    override val pending: Flow<List<TimeslotRequest>?> = combine(memberId, cache, settled) { member, cached, settled ->
        cached?.takeIf { member != null && it.memberId == member }?.requests?.filterNot { it.id in settled }
    }.distinctUntilChanged()

    override suspend fun refresh() {
        val me = session.currentSession ?: return
        val requests = remote.fetchPending(me.workspaceId)
        cache.value = Cached(me.memberId, requests.sortedByDescending { it.createdAt })
    }

    override suspend fun markApproved(id: String) = resolve(id, TimeslotRequestStatus.Approved)

    override suspend fun markDeclined(id: String) = resolve(id, TimeslotRequestStatus.Declined)

    private suspend fun resolve(id: String, status: TimeslotRequestStatus) {
        session.requireSession()
        settled.update { it + id }
        try {
            remote.resolve(id, status, clock.now())
        } catch (e: Exception) {
            // Cancelled too: the outcome is unknown, so the row shows again.
            settled.update { it - id }
            throw e
        }
        cache.update { cached -> cached?.copy(requests = cached.requests.filterNot { it.id == id }) }
    }
}
