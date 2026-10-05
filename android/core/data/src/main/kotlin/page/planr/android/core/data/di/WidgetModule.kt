package page.planr.android.core.data.di

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds
import page.planr.android.core.data.sync.WidgetRefresher

/**
 * Declares the (possibly empty) set of [WidgetRefresher]s; :widgets adds its
 * implementation with `@Binds @IntoSet`.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class WidgetModule {
    @Multibinds
    abstract fun widgetRefreshers(): Set<WidgetRefresher>
}
