package page.planr.android.core.data.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import page.planr.android.core.data.repository.RemoteTimeslotRequestRepository
import page.planr.android.core.data.repository.TimeslotRequestRepository

/** The Inbox's public-share timeslot requests. */
@Module
@InstallIn(SingletonComponent::class)
abstract class InboxModule {
    @Binds
    abstract fun bindTimeslotRequestRepository(impl: RemoteTimeslotRequestRepository): TimeslotRequestRepository
}
