package page.planr.android.core.data.di

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.serializer.KotlinXSerializer
import io.ktor.client.engine.okhttp.OkHttp
import javax.inject.Singleton
import page.planr.android.core.data.auth.AccessTokenSource
import page.planr.android.core.data.config.PlanrConfig
import page.planr.android.core.data.remote.PostgrestGateway
import page.planr.android.core.data.remote.SupabasePostgrestGateway
import page.planr.android.core.model.PlanrJson

@Module
@InstallIn(SingletonComponent::class)
abstract class SupabaseModule {

    @Binds
    abstract fun bindPostgrestGateway(impl: SupabasePostgrestGateway): PostgrestGateway

    companion object {
        /**
         * The Supabase client (PostgREST + Realtime). There is no Auth plugin:
         * the OAuth session is ours ([AccessTokenSource] = SessionManager),
         * handed to every request through supabase-kt's third-party
         * `accessToken` hook — the same Bearer-token path as `clientForToken`
         * in lib/mcp/client.ts, so RLS applies exactly as in the browser.
         *
         * An unconfigured build gets a placeholder URL; it never signs in, so
         * it never makes a request.
         */
        @Provides
        @Singleton
        fun provideSupabaseClient(config: PlanrConfig, tokens: AccessTokenSource): SupabaseClient =
            createSupabaseClient(
                supabaseUrl = config.supabaseUrl.ifBlank { UNCONFIGURED_URL },
                supabaseKey = config.supabaseAnonKey.ifBlank { UNCONFIGURED_KEY },
            ) {
                defaultSerializer = KotlinXSerializer(PlanrJson)
                httpEngine = OkHttp.create()
                accessToken = { tokens.accessToken() }
                install(Postgrest)
                install(Realtime)
            }

        private const val UNCONFIGURED_URL = "https://unconfigured.invalid"
        private const val UNCONFIGURED_KEY = "unconfigured"
    }
}
