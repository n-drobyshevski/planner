package page.planr.android.feature.quickadd.data

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
abstract class QuickAddDataModule {
    @Binds
    abstract fun bindQuickAddDataSource(impl: RepositoryQuickAddDataSource): QuickAddDataSource
}
