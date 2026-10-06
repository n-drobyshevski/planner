package page.planr.android.core.data.auth

import android.util.Log
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import java.util.Base64
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.flow.first
import kotlinx.serialization.KSerializer
import page.planr.android.core.model.PlanrJson

/** Persistence for the session and the in-flight sign-in. */
interface SessionStore {
    suspend fun readSession(): StoredSession?

    /** null clears it. */
    suspend fun writeSession(session: StoredSession?)

    /**
     * Sign-out: the stored session must never be read back, or the next
     * launch would sign the user in again. Unlike [writeSession], throws
     * when that can't be guaranteed.
     */
    suspend fun forgetSession() = writeSession(null)

    suspend fun readPending(): PendingAuthorization?

    suspend fun writePending(pending: PendingAuthorization?)
}

/**
 * [SessionStore] on Preferences DataStore, every value encrypted with
 * [TokenCipher] (Keystore AES-GCM in production). A value that no longer
 * decrypts — e.g. the Keystore key was wiped — reads as absent and is removed,
 * which simply sends the user back to sign-in.
 *
 * Never throws but from [forgetSession]: a store that can't be read (I/O, a
 * Keystore failure) reads as signed out, and a failed write is logged and
 * dropped — the in-memory session in [SessionManager] carries on, at worst
 * asking for a sign-in on the next launch.
 */
class DataStoreSessionStore @Inject constructor(
    @SessionDataStore private val dataStore: DataStore<Preferences>,
    private val cipher: TokenCipher,
) : SessionStore {

    override suspend fun readSession(): StoredSession? = read(SESSION, StoredSession.serializer())

    override suspend fun writeSession(session: StoredSession?) = write(SESSION, session, StoredSession.serializer())

    /**
     * Removes the session; when the disk refuses (full, an I/O error), retires
     * the key it is encrypted with instead, so the tokens left on disk never
     * decrypt again (and read as absent: see [read]).
     */
    override suspend fun forgetSession() {
        try {
            dataStore.edit { it.remove(SESSION) }
            return
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Couldn't remove the stored session, retiring its key", e)
        }
        cipher.retireKey()
    }

    override suspend fun readPending(): PendingAuthorization? = read(PENDING, PendingAuthorization.serializer())

    override suspend fun writePending(pending: PendingAuthorization?) =
        write(PENDING, pending, PendingAuthorization.serializer())

    private suspend fun <T> read(key: Preferences.Key<String>, serializer: KSerializer<T>): T? {
        val stored = try {
            dataStore.data.first()[key]
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Couldn't read the stored session", e)
            return null
        } ?: return null
        return runCatching {
            val plain = cipher.decrypt(Base64.getDecoder().decode(stored))
            PlanrJson.decodeFromString(serializer, plain.decodeToString())
        }.getOrElse {
            edit { it.remove(key) }
            null
        }
    }

    private suspend fun <T> write(key: Preferences.Key<String>, value: T?, serializer: KSerializer<T>) {
        edit { prefs ->
            if (value == null) {
                prefs.remove(key)
            } else {
                val plain = PlanrJson.encodeToString(serializer, value).encodeToByteArray()
                prefs[key] = Base64.getEncoder().encodeToString(cipher.encrypt(plain))
            }
        }
    }

    private suspend fun edit(transform: (MutablePreferences) -> Unit) {
        try {
            dataStore.edit(transform)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Couldn't store the session", e)
        }
    }

    private companion object {
        val SESSION = stringPreferencesKey("session")
        val PENDING = stringPreferencesKey("pending_authorization")
        const val TAG = "Planr"
    }
}
