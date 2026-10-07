package page.planr.android.core.data.notify

import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.time.Instant
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.toJavaLocalDate
import page.planr.android.core.data.model.TimeslotRequest
import page.planr.android.core.data.model.TimeslotRequestStatus
import page.planr.android.core.data.repository.TimeslotRequestRepository

/** "Tue 7 Oct" and "14:00", whatever the device says. */
object FixedWhenFormats : WhenFormats {
    private val day = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)

    override fun day(date: LocalDate): String = day.format(date.toJavaLocalDate())

    override fun time(time: LocalTime): String = String.format(Locale.ROOT, "%02d:%02d", time.hour, time.minute)
}

class FakeNotifyPrefs(newRequests: Boolean = false, partnerChanges: Boolean = false) : NotifyPrefs {
    override val newRequests = MutableStateFlow(newRequests)
    override val partnerChanges = MutableStateFlow(partnerChanges)
    var seen: Set<String>? = null
    var since: Instant? = null
    var cleared = 0

    override suspend fun setNewRequests(on: Boolean) {
        if (on != newRequests.value) seen = null
        newRequests.value = on
    }

    override suspend fun setPartnerChanges(on: Boolean) {
        partnerChanges.value = on
    }

    override suspend fun seenRequests(): Set<String>? = seen

    override suspend fun setSeenRequests(ids: Set<String>) {
        seen = ids
    }

    override suspend fun partnerChangesSince(): Instant? = since.takeIf { partnerChanges.value }

    override suspend fun clearMember() {
        cleared++
        seen = null
    }
}

class FakeNotificationPort : NotificationPort {
    var allowed = true
    val posted = mutableListOf<NotifyContent>()
    val cancelled = mutableListOf<NotifyChannel>()
    val channels = mutableSetOf<NotifyChannel>()

    override fun canPost(channel: NotifyChannel): Boolean = allowed

    override fun ensureChannel(channel: NotifyChannel) {
        channels += channel
    }

    override fun post(content: NotifyContent) {
        posted += content
    }

    override fun cancelAll(channel: NotifyChannel) {
        cancelled += channel
    }
}

class FakeTimeslotRequests : TimeslotRequestRepository {
    override val pending = MutableStateFlow<List<TimeslotRequest>?>(null)

    /** What the server would answer the next refresh with. */
    var server: List<TimeslotRequest> = emptyList()
    val refreshes = mutableListOf<Boolean>()

    override suspend fun refresh(force: Boolean) {
        refreshes += force
        pending.value = server
    }

    override suspend fun markApproved(id: String) = Unit

    override suspend fun markDeclined(id: String) = Unit
}

fun request(
    id: String,
    created: String = "2026-10-06T09:00:00Z",
    name: String? = "Anna",
    start: String = "2026-10-07T12:00:00Z",
    end: String = "2026-10-07T13:00:00Z",
    status: TimeslotRequestStatus = TimeslotRequestStatus.Pending,
) = TimeslotRequest(
    id = id,
    shareId = "share-1",
    workspaceId = "ws-1",
    ownerId = "me",
    requesterName = name,
    message = null,
    proposedStart = Instant.parse(start),
    proposedEnd = Instant.parse(end),
    status = status,
    createdAt = Instant.parse(created),
    resolvedAt = null,
)
