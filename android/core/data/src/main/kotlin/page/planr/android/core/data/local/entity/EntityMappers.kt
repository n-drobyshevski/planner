package page.planr.android.core.data.local.entity

import page.planr.android.core.model.Board
import page.planr.android.core.model.Category
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.Member
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.PlanrJson
import page.planr.android.core.model.Task

/** Model <-> entity. The payload is the row in its snake_case JSON form. */

fun Member.toEntity() = MemberEntity(
    id = id,
    workspaceId = workspaceId,
    createdAt = createdAt?.toEpochMilliseconds(),
    payload = PlanrJson.encodeToString(Member.serializer(), this),
)

fun MemberEntity.toModel(): Member = PlanrJson.decodeFromString(Member.serializer(), payload)

fun Category.toEntity() = CategoryEntity(
    id = id,
    workspaceId = workspaceId,
    ownerId = ownerId,
    sortOrder = sortOrder,
    payload = PlanrJson.encodeToString(Category.serializer(), this),
)

fun CategoryEntity.toModel(): Category = PlanrJson.decodeFromString(Category.serializer(), payload)

fun Board.toEntity() = BoardEntity(
    id = id,
    workspaceId = workspaceId,
    collectionId = collectionId,
    position = position,
    isDone = isDone,
    payload = PlanrJson.encodeToString(Board.serializer(), this),
)

fun BoardEntity.toModel(): Board = PlanrJson.decodeFromString(Board.serializer(), payload)

fun PlannerEvent.toEntity() = EventEntity(
    id = id,
    workspaceId = workspaceId,
    startsAt = start.toEpochMilliseconds(),
    endsAt = end.toEpochMilliseconds(),
    isRecurring = rrule != null,
    recurrenceEndsAt = recurrenceEndsAt?.toEpochMilliseconds(),
    taskId = taskId,
    payload = PlanrJson.encodeToString(PlannerEvent.serializer(), this),
)

fun EventEntity.toModel(): PlannerEvent = PlanrJson.decodeFromString(PlannerEvent.serializer(), payload)

fun EventOverride.toEntity() = EventOverrideEntity(
    id = id,
    workspaceId = workspaceId,
    eventId = eventId,
    occurrenceDate = occurrenceDate.toEpochMilliseconds(),
    payload = PlanrJson.encodeToString(EventOverride.serializer(), this),
)

fun EventOverrideEntity.toModel(): EventOverride = PlanrJson.decodeFromString(EventOverride.serializer(), payload)

fun Task.toEntity() = TaskEntity(
    id = id,
    workspaceId = workspaceId,
    parentId = parentId,
    position = position,
    createdAt = createdAt.toEpochMilliseconds(),
    completedAt = completedAt?.toEpochMilliseconds(),
    dueDate = dueDate?.toString(),
    payload = PlanrJson.encodeToString(Task.serializer(), this),
)

fun TaskEntity.toModel(): Task = PlanrJson.decodeFromString(Task.serializer(), payload)
