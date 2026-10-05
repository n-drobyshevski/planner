package page.planr.android.core.data.repository

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager

/** The signed-in workspace id as a flow (null when signed out). */
internal fun SessionManager.workspaceIds(): Flow<String?> =
    authState.map { (it as? AuthState.SignedIn)?.session?.workspaceId }.distinctUntilChanged()

/**
 * Switches [block] to the current workspace; emits [whenSignedOut] while there
 * is none, so screens and widgets go empty on sign-out instead of erroring.
 */
@OptIn(ExperimentalCoroutinesApi::class)
internal fun <T> SessionManager.inWorkspace(whenSignedOut: T, block: (String) -> Flow<T>): Flow<T> =
    workspaceIds().flatMapLatest { ws -> if (ws == null) flowOf(whenSignedOut) else block(ws) }
