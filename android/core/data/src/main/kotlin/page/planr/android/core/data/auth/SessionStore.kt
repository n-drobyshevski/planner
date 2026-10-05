package page.planr.android.core.data.auth

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import java.util.Base64
import javax.inject.Inject
import kotlinx.coroutines.flow.first
import kotlinx.serialization.KSerializer
import page.planr.android.core.model.PlanrJson

/** Persistence for the session and the in-flight sign-in. */
interface SessionStore {
    suspend fun readSession(): StoredSession?

    /** null clears it. */
    suspend fun writeSession(session: StoredSession?)

    suspend fun readPending(): PendingAuthorization?

    suspend fun writePending(pending: PendingAuthorization?)
}

/**
 * [SessionStore] on Preferences DataStore, every value encrypted with
 * [TokenCipher] (Keystore AES-GCM in production). A value that no longer
 * decrypts — e.g. the Keystore key was wiped — reads as absent and is removed,
 * which simply sends the user back to sign-in.
 */
class DataStoreSessionStore @Inject constructor(
    @SessionDataStore private val dataStore: DataStore<Preferences>,
    private val cipher: TokenCipher,
) : SessionStore {

    override suspend fun readSession(): StoredSession? = read(SESSION, StoredSession.serializer())

    override suspend fun writeSession(session: StoredSession?) = write(SESSION, session, StoredSession.serializer())

    override suspend fun readPending(): PendingAuthorization? = read(PENDING, PendingAuthorization.serializer())

    override suspend fun writePending(pending: PendingAuthorization?) =
        write(PENDING, pending, PendingAuthorization.serializer())

    private suspend fun <T> read(key: Preferences.Key<String>, serializer: KSerializer<T>): T? {
        val stored = dataStore.data.first()[key] ?: return null
        return runCatching {
            val plain = cipher.decrypt(Base64.getDecoder().decode(stored))
            PlanrJson.decodeFromString(serializer, plain.decodeToString())
        }.getOrElse {
            dataStore.edit { it.remove(key) }
            null
        }
    }

    private suspend fun <T> write(key: Preferences.Key<String>, value: T?, serializer: KSerializer<T>) {
        dataStore.edit { prefs ->
            if (value == null) {
                prefs.remove(key)
            } else {
                val plain = PlanrJson.encodeToString(serializer, value).encodeToByteArray()
                prefs[key] = Base64.getEncoder().encodeToString(cipher.encrypt(plain))
            }
        }
    }

    private companion object {
        val SESSION = stringPreferencesKey("session")
        val PENDING = stringPreferencesKey("pending_authorization")
    }
}
