package page.planr.android.widgets

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionInfo
import page.planr.android.core.data.auth.SessionManager

/** What a data widget shows: its data, or why it has none. */
internal sealed interface WidgetContent<out T> {
    /** The stored session is still being restored (a cold process start). */
    data object Loading : WidgetContent<Nothing>

    data object SignedOut : WidgetContent<Nothing>

    /** Reading the cache failed (e.g. an event the expander rejects). */
    data object Unavailable : WidgetContent<Nothing>

    data class Ready<T>(val data: T) : WidgetContent<T>
}

/** Restoring the session reads one DataStore file; anything slower is a stuck start. */
private val SESSION_RESTORE_TIMEOUT = 5.seconds

/**
 * Runs [read] (Room only, never the network) for the signed-in member. Waits
 * out the startup restore first, so a widget rendered by a freshly started
 * process doesn't flash "signed out".
 */
internal suspend fun <T> loadForSession(
    session: SessionManager,
    read: suspend (SessionInfo) -> T,
): WidgetContent<T> {
    val state = withTimeoutOrNull(SESSION_RESTORE_TIMEOUT) {
        session.authState.first { it != AuthState.Loading }
    } ?: return WidgetContent.Loading
    val info = (state as? AuthState.SignedIn)?.session ?: return WidgetContent.SignedOut
    return try {
        WidgetContent.Ready(read(info))
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        WidgetContent.Unavailable
    }
}

/**
 * Content loaded for [key], reloaded whenever [key] changes. A running Glance
 * session never re-runs `provideGlance`; an update only changes its state, so
 * widgets key their content on that state (the refresh tick, pending
 * completions). [initial] was loaded for [initialKey] before composition, so
 * the first frame already has data and isn't loaded twice.
 */
@Composable
internal fun <K, T> rememberLoaded(initialKey: K, initial: T, key: K, load: suspend (K) -> T): T {
    var loaded by remember { mutableStateOf(initialKey to initial) }
    LaunchedEffect(key) {
        if (key != loaded.first) loaded = key to load(key)
    }
    return loaded.second
}
