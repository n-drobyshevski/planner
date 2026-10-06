package page.planr.android.feature.inbox

import kotlin.time.Clock
import kotlin.time.Duration.Companion.days
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.data.model.TimeslotRequest
import page.planr.android.core.data.model.TimeslotRequestStatus
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.Task

/** Fixtures for the Inbox ViewModels: Tuesday 6 October 2026, 15:00 in Berlin (13:00 UTC). */
object TestData {
    val NOW: Instant = Instant.parse("2026-10-06T13:00:00Z")

    val clock = object : Clock {
        override fun now(): Instant = NOW
    }

    private val none = JsonObject(emptyMap())

    fun event(
        id: String,
        title: String = "Standup",
        end: Instant = NOW - 1.hours,
        ownerId: String = FakeInboxDataSource.ME,
        attributes: JsonObject = none,
    ) = Occurrence(
        key = id,
        eventId = id,
        occurrenceDate = end - 1.hours,
        start = end - 1.hours,
        end = end,
        allDay = false,
        inactive = false,
        status = EventStatus.Confirmed,
        title = title,
        description = null,
        location = null,
        categoryId = null,
        color = null,
        kind = EventKind.Event,
        ownerId = ownerId,
        isPrivate = false,
        isShared = false,
        hiddenFromPublic = false,
        taskId = null,
        attributes = attributes,
        isRecurring = false,
        isException = false,
    )

    fun task(id: String, title: String = "Ship", completedAt: Instant = NOW - 2.hours, attributes: JsonObject = none) = Task(
        id = id,
        workspaceId = FakeInboxDataSource.WS,
        ownerId = FakeInboxDataSource.ME,
        assigneeId = FakeInboxDataSource.ME,
        title = title,
        completedAt = completedAt,
        attributes = attributes,
        createdAt = NOW - 3.days,
        updatedAt = completedAt,
    )

    fun request(id: String, name: String? = "Jordan", message: String? = "coffee?", createdAt: Instant = NOW - 5.hours) =
        TimeslotRequest(
            id = id,
            shareId = "share-1",
            workspaceId = FakeInboxDataSource.WS,
            ownerId = FakeInboxDataSource.ME,
            requesterName = name,
            message = message,
            proposedStart = Instant.parse("2026-10-08T13:00:00Z"),
            proposedEnd = Instant.parse("2026-10-08T14:00:00Z"),
            status = TimeslotRequestStatus.Pending,
            createdAt = createdAt,
            resolvedAt = null,
        )
}
