package page.planr.android.core.data.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import page.planr.android.core.data.repository.RemoteSleepLogRepository
import page.planr.android.core.data.repository.SleepLogRepository

/** The member's sleep logs (the morning check-in and the Insights Sleep tab). */
@Module
@InstallIn(SingletonComponent::class)
abstract class SleepModule {
    @Binds
    abstract fun bindSleepLogRepository(impl: RemoteSleepLogRepository): SleepLogRepository
}
