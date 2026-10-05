package page.planr.android.feature.insights

import java.time.ZoneId
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.insights.filter.InsightsFilter
import page.planr.android.core.insights.filter.InsightsFilters
import page.planr.android.core.insights.model.Attributes
import page.planr.android.core.insights.model.InsightTask
import page.planr.android.core.insights.model.PeriodState
import page.planr.android.core.insights.model.Span
import page.planr.android.core.insights.period.Periods
import page.planr.android.core.model.Category
import page.planr.android.core.model.EventKind
import page.planr.android.core.model.EventStatus
import page.planr.android.core.model.Member
import page.planr.android.core.model.Occurrence
import page.planr.android.core.model.Task
import page.planr.android.feature.insights.model.InsightsInputs

const val WS = "ws-1"
const val ANNA = "member-a"
const val BORIS = "member-b"
const val BERLIN_ID = "Europe/Berlin"

val BERLIN: ZoneId = ZoneId.of(BERLIN_ID)

/** Sunday 2026-10-04 10:00 UTC (12:00 in Berlin). */
val NOW: Instant = Instant.parse("2026-10-04T10:00:00Z")
val NOW_MS: Long = NOW.toEpochMilliseconds()

/** A clock tests can move. */
class FixedClock(var instant: Instant = NOW) : Clock {
    override fun now(): Instant = instant
}

/** The viewer. Both members live in Berlin, unlike the test JVM (Pacific/Chatham). */
val anna = Member(id = ANNA, workspaceId = WS, name = "Anna", color = "#c0492a", timezone = BERLIN_ID)
val boris = Member(id = BORIS, workspaceId = WS, name = "Boris", color = "#0f766e", timezone = BERLIN_ID)

val sharedHome = Category(id = "cat-home", workspaceId = WS, ownerId = null, name = "Home", color = "#b45309")
val annaWork = Category(id = "cat-work", workspaceId = WS, ownerId = ANNA, name = "Work", color = "#2a77b8")

private const val HOUR = 3_600_000L

/** An analytics span, by default Anna's tracked, uncategorized hour at [NOW]. */
fun span(
    key: String,
    start: Long = NOW_MS,
    end: Long = start + HOUR,
    owner: String = ANNA,
    shared: Boolean = false,
    category: String? = null,
    kind: EventKind = EventKind.Event,
    allDay: Boolean = false,
    inactive: Boolean = false,
    title: String = key,
    attributes: Attributes = Attributes.None,
): Span = Span(
    key = key,
    eventId = key,
    title = title,
    start = start,
    end = end,
    kind = kind,
    allDay = allDay,
    inactive = inactive,
    ownerId = owner,
    isShared = shared,
    categoryId = category,
    attributes = attributes,
)

/** An analytics task, by default Anna's open top-level task created a day before [NOW]. */
fun task(
    id: String,
    owner: String = ANNA,
    assignee: String? = null,
    parent: String? = null,
    createdAt: Long = NOW_MS - 24 * HOUR,
    completedAt: Long? = null,
    due: java.time.LocalDate? = null,
): InsightTask = InsightTask(
    id = id,
    title = "Task $id",
    parentId = parent,
    collectionId = null,
    ownerId = owner,
    assigneeId = assignee,
    createdAt = createdAt,
    completedAt = completedAt,
    dueDate = due,
)

/** A Room-side occurrence (what the data source emits), by default Anna's hour at [NOW]. */
fun occurrence(
    key: String,
    start: Instant = NOW,
    end: Instant = Instant.fromEpochMilliseconds(start.toEpochMilliseconds() + HOUR),
    owner: String = ANNA,
    shared: Boolean = false,
    category: String? = null,
    inactive: Boolean = false,
    attributes: JsonObject = JsonObject(emptyMap()),
): Occurrence = Occurrence(
    key = key,
    eventId = key,
    occurrenceDate = start,
    start = start,
    end = end,
    allDay = false,
    inactive = inactive,
    status = EventStatus.Confirmed,
    title = key,
    description = null,
    location = null,
    categoryId = category,
    color = null,
    kind = EventKind.Event,
    ownerId = owner,
    isPrivate = false,
    isShared = shared,
    hiddenFromPublic = false,
    taskId = null,
    attributes = attributes,
    isRecurring = false,
    isException = false,
)

/** A Room-side task row (what the data source emits). */
fun taskRow(
    id: String,
    owner: String = ANNA,
    assignee: String? = null,
    parent: String? = null,
    createdAt: Instant = Instant.fromEpochMilliseconds(NOW_MS - 24 * HOUR),
    completedAt: Instant? = null,
    due: kotlinx.datetime.LocalDate? = null,
): Task = Task(
    id = id,
    workspaceId = WS,
    ownerId = owner,
    assigneeId = assignee,
    parentId = parent,
    title = "Task $id",
    dueDate = due,
    completedAt = completedAt,
    createdAt = createdAt,
    updatedAt = createdAt,
)

/**
 * Builder inputs for Anna in Berlin, the period resolved through [Periods.resolve]
 * and the spans and tasks filtered like the ViewModel does.
 */
fun inputs(
    spans: List<Span> = emptyList(),
    prevSpans: List<Span> = emptyList(),
    tasks: List<InsightTask> = emptyList(),
    state: PeriodState = PeriodState(),
    now: Long = NOW_MS,
    zone: ZoneId = BERLIN,
    hiddenCategoryIds: Set<String> = emptySet(),
    includeInactive: Boolean = false,
    categories: List<Category> = listOf(sharedHome, annaWork),
): InsightsInputs {
    val filter = InsightsFilter(ANNA, hiddenCategoryIds, includeInactive)
    return InsightsInputs(
        viewerId = ANNA,
        zone = zone,
        now = now,
        state = state,
        period = Periods.resolve(state, zone, now),
        spans = InsightsFilters.filterForInsights(spans, filter),
        prevSpans = InsightsFilters.filterForInsights(prevSpans, filter),
        tasks = InsightsFilters.viewerTasks(tasks, ANNA),
        categories = categories.associateByTo(LinkedHashMap()) { it.id },
    )
}
