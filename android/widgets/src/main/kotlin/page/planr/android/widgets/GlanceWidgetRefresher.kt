package page.planr.android.widgets

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import page.planr.android.core.data.sync.WidgetRefresher

/**
 * The :widgets side of :core:data's widget refresh: in-app writes, Realtime
 * changes and the periodic sync all end here (via `WidgetRefreshDispatcher`),
 * and every widget re-renders from Room. Also keeps the midnight rollover
 * scheduled while a dated widget is on a home screen.
 */
@Singleton
class GlanceWidgetRefresher @Inject constructor(
    @ApplicationContext private val context: Context,
) : WidgetRefresher {

    override suspend fun refreshWidgets() {
        WidgetUpdates.refreshAll(context)
        DayRollover.sync(context)
    }
}
