package page.planr.android.core.data.di

import javax.inject.Qualifier

/**
 * A process-lifetime CoroutineScope (SupervisorJob + Dispatchers.Default) for
 * work that must outlive any screen: the OAuth exchange, token refresh,
 * Realtime sync.
 */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ApplicationScope
