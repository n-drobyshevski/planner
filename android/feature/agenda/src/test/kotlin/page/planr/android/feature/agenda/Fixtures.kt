package page.planr.android.feature.agenda

import kotlin.time.Clock
import kotlin.time.Instant
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member
import page.planr.android.core.model.PlannerEvent

/** Shared test data: a two-member workspace in Berlin. */
object Fixtures {
    const val WORKSPACE = "ws-1"
    const val ANNA = "member-a"
    const val BORIS = "member-b"
    const val ZONE = "Europe/Berlin"

    val anna = Member(id = ANNA, workspaceId = WORKSPACE, name = "Anna", color = "#c0492a", timezone = ZONE)
    val boris = Member(id = BORIS, workspaceId = WORKSPACE, name = "Boris", color = "#0f766e", timezone = ZONE)

    val work = Category(id = "cat-work", workspaceId = WORKSPACE, ownerId = ANNA, name = "Work", color = "#0369a1")
    val home = Category(id = "cat-home", workspaceId = WORKSPACE, ownerId = null, name = "Home", color = "#15803d")

    val created: Instant = Instant.parse("2026-09-01T08:00:00Z")
    val updated: Instant = Instant.parse("2026-09-02T08:00:00.123Z")

    fun event(
        id: String = "ev-1",
        owner: String = ANNA,
        title: String = "Standup",
        start: String = "2026-10-05T07:00:00Z",
        end: String = "2026-10-05T08:00:00Z",
        rrule: String? = null,
        categoryId: String? = null,
        isShared: Boolean = false,
        isPrivate: Boolean = false,
        allDay: Boolean = false,
        color: String? = null,
    ) = PlannerEvent(
        id = id,
        workspaceId = WORKSPACE,
        ownerId = owner,
        categoryId = categoryId,
        title = title,
        isPrivate = isPrivate,
        isShared = isShared,
        color = color,
        allDay = allDay,
        start = Instant.parse(start),
        end = Instant.parse(end),
        timeZone = ZONE,
        rrule = rrule,
        createdAt = created,
        updatedAt = updated,
    )

    /** A clock stopped at [at]. */
    fun clockAt(at: String): Clock = object : Clock {
        override fun now(): Instant = Instant.parse(at)
    }
}
