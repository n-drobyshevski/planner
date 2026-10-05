package page.planr.android.core.data.auth

import javax.inject.Qualifier

/** The Ktor client used for the OAuth token endpoint (not the Supabase one). */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class AuthHttpClient

/** The encrypted session DataStore. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class SessionDataStore
