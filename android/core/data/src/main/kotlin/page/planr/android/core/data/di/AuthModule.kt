package page.planr.android.core.data.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.preferencesDataStoreFile
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import java.util.concurrent.TimeUnit
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import page.planr.android.core.data.auth.AccessTokenSource
import page.planr.android.core.data.auth.AesGcmTokenCipher
import page.planr.android.core.data.auth.AuthHttpClient
import page.planr.android.core.data.auth.DataStoreSessionStore
import page.planr.android.core.data.auth.KeystoreSessionKey
import page.planr.android.core.data.auth.KtorOAuthTokenClient
import page.planr.android.core.data.auth.LocalDataCleaner
import page.planr.android.core.data.auth.MemberLookup
import page.planr.android.core.data.auth.OAuthTokenClient
import page.planr.android.core.data.auth.QueriesMemberLookup
import page.planr.android.core.data.auth.SessionDataStore
import page.planr.android.core.data.auth.SessionManager
import page.planr.android.core.data.auth.SessionStore
import page.planr.android.core.data.auth.TokenCipher
import page.planr.android.core.data.local.RoomLocalDataCleaner

@Module
@InstallIn(SingletonComponent::class)
abstract class AuthModule {

    @Binds
    abstract fun bindAccessTokenSource(impl: SessionManager): AccessTokenSource

    @Binds
    abstract fun bindSessionStore(impl: DataStoreSessionStore): SessionStore

    @Binds
    abstract fun bindTokenClient(impl: KtorOAuthTokenClient): OAuthTokenClient

    @Binds
    abstract fun bindMemberLookup(impl: QueriesMemberLookup): MemberLookup

    @Binds
    abstract fun bindLocalDataCleaner(impl: RoomLocalDataCleaner): LocalDataCleaner

    companion object {
        @Provides
        @Singleton
        fun provideTokenCipher(): TokenCipher = AesGcmTokenCipher(KeystoreSessionKey::getOrCreate)

        @Provides
        @Singleton
        @SessionDataStore
        fun provideSessionDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
            PreferenceDataStoreFactory.create(
                corruptionHandler = ReplaceFileCorruptionHandler { emptyPreferences() },
                scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
                produceFile = { context.preferencesDataStoreFile("planr_session") },
            )

        @Provides
        @Singleton
        @AuthHttpClient
        fun provideAuthHttpClient(): HttpClient = HttpClient(OkHttp) {
            engine {
                config {
                    connectTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    readTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                }
            }
        }

        private const val TIMEOUT_SECONDS = 20L
    }
}
