package page.planr.android.widgets

import android.content.Context
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlin.time.Clock
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.repository.OccurrenceRepository
import page.planr.android.core.data.repository.TaskRepository
import page.planr.android.core.data.repository.WorkspaceRepository
import page.planr.android.core.data.sync.SyncScheduler

/**
 * The data layer, for code Hilt can't construct: Glance widgets, their
 * receivers and action callbacks are instantiated by the framework.
 */
@EntryPoint
@InstallIn(SingletonComponent::class)
interface WidgetEntryPoint {
    fun sessionManager(): SessionManager

    fun occurrenceRepository(): OccurrenceRepository

    fun workspaceRepository(): WorkspaceRepository

    fun taskRepository(): TaskRepository

    fun syncScheduler(): SyncScheduler

    fun clock(): Clock

    companion object {
        fun from(context: Context): WidgetEntryPoint =
            EntryPointAccessors.fromApplication(context.applicationContext, WidgetEntryPoint::class.java)
    }
}
