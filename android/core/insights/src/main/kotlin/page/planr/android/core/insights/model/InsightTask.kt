package page.planr.android.core.insights.model

import java.time.LocalDate
import kotlinx.datetime.toJavaLocalDate
import page.planr.android.core.model.Task

/** One task as analytics sees it (the subset of the web's `TaskRow` it reads). */
data class InsightTask(
    val id: String,
    val title: String,
    val parentId: String?,
    val collectionId: String?,
    val ownerId: String,
    val assigneeId: String?,
    val createdAt: Long,
    val completedAt: Long?,
    /** Zone-free calendar date. */
    val dueDate: LocalDate?,
) {
    companion object {
        fun of(t: Task): InsightTask = InsightTask(
            id = t.id,
            title = t.title,
            parentId = t.parentId,
            collectionId = t.collectionId,
            ownerId = t.ownerId,
            assigneeId = t.assigneeId,
            createdAt = t.createdAt.toEpochMilliseconds(),
            completedAt = t.completedAt?.toEpochMilliseconds(),
            dueDate = t.dueDate?.toJavaLocalDate(),
        )
    }
}
