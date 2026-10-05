package page.planr.android.widgets.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import page.planr.android.core.data.sync.WidgetRefresher
import page.planr.android.widgets.GlanceWidgetRefresher

/** Contributes the Glance refresher to :core:data's set of [WidgetRefresher]s. */
@Module
@InstallIn(SingletonComponent::class)
abstract class WidgetsModule {
    @Binds
    @IntoSet
    abstract fun bindWidgetRefresher(impl: GlanceWidgetRefresher): WidgetRefresher
}
