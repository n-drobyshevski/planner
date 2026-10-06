package page.planr.android.core.data.auth

import androidx.datastore.core.DataStore
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import java.io.File
import java.io.IOException
import java.security.KeyStoreException
import java.nio.file.Files
import javax.crypto.AEADBadTagException
import javax.crypto.KeyGenerator
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest

/**
 * The encrypted session store on a real Preferences DataStore file. The
 * production key lives in the Android Keystore; here a software AES key runs
 * the same AES-GCM code path.
 */
class TokenStoreTest {
    private val dir: File = Files.createTempDirectory("planr-session").toFile()
    private fun newKey() = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()

    private var key = newKey()
    private val cipher = AesGcmTokenCipher { key }

    private val session = StoredSession(
        accessToken = "access-SECRET",
        refreshToken = "refresh-SECRET",
        expiresAtEpochSec = 1_780_003_600,
        userId = "user-1",
        memberId = "m1",
        workspaceId = "ws",
    )

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    /** One DataStore per file per process (DataStore enforces it), so one per test. */
    private fun TestScope.store() =
        DataStoreSessionStore(
            PreferenceDataStoreFactory.create(scope = backgroundScope, produceFile = { File(dir, "session.preferences_pb") }),
            cipher,
        )

    @Test
    fun `cipher round-trips with a fresh IV every time`() {
        val plain = "hello".encodeToByteArray()
        val a = cipher.encrypt(plain)
        val b = cipher.encrypt(plain)
        assertNotEquals(a.toList(), b.toList())
        assertContentEquals(plain, cipher.decrypt(a))

        a[a.size - 1] = (a[a.size - 1].toInt() xor 1).toByte()
        assertFailsWith<AEADBadTagException> { cipher.decrypt(a) }
    }

    @Test
    fun `session and pending sign-in round-trip and are encrypted at rest`() = runTest {
        val store = store()
        assertNull(store.readSession())
        store.writeSession(session)
        val pending = PendingAuthorization("state", "verifier-SECRET", "https://planr.page/app/auth/callback", 42)
        store.writePending(pending)

        assertEquals(session, store.readSession())
        assertEquals(pending, store.readPending())

        val onDisk = File(dir, "session.preferences_pb").readBytes().decodeToString()
        assertFalse("SECRET" in onDisk)

        store.writeSession(null)
        assertNull(store.readSession())
        assertEquals(pending, store.readPending())
    }

    @Test
    fun `a value that no longer decrypts reads as signed out`() = runTest {
        val store = store()
        store.writeSession(session)
        val original = key
        // As if the Keystore key had been wiped and recreated.
        key = newKey()
        assertNull(store.readSession())
        // ...and the undecryptable value was removed, not left behind.
        key = original
        assertNull(store.readSession())
    }

    /** A DataStore on a broken disk: reading and writing both throw. */
    private class BrokenDataStore : DataStore<Preferences> {
        override val data: Flow<Preferences> = flow { throw IOException("unreadable") }
        override suspend fun updateData(transform: suspend (Preferences) -> Preferences): Preferences =
            throw IOException("disk full")
    }

    @Test
    fun `an unreadable store reads as signed out and drops writes`() = runTest {
        val store = DataStoreSessionStore(BrokenDataStore(), cipher)

        assertNull(store.readSession())
        assertNull(store.readPending())
        store.writeSession(session)
        store.writePending(null)
        assertNull(store.readSession())
    }

    @Test
    fun `a session that can't be encrypted is not stored, and nothing throws`() = runTest {
        val store = DataStoreSessionStore(
            PreferenceDataStoreFactory.create(scope = backgroundScope, produceFile = { File(dir, "session.preferences_pb") }),
            object : TokenCipher by cipher {
                override fun encrypt(plaintext: ByteArray): ByteArray = throw KeyStoreException("locked")
            },
        )

        store.writeSession(session)
        assertNull(store.readSession())
    }

    @Test
    fun `a corrupt file is replaced with an empty one`() = runTest {
        File(dir, "session.preferences_pb").writeBytes(byteArrayOf(0x7f, 0x01, 0x02, 0x03))
        val store = DataStoreSessionStore(
            PreferenceDataStoreFactory.create(
                corruptionHandler = ReplaceFileCorruptionHandler { emptyPreferences() },
                scope = backgroundScope,
                produceFile = { File(dir, "session.preferences_pb") },
            ),
            cipher,
        )

        assertNull(store.readSession())
        store.writeSession(session)
        assertEquals(session, store.readSession())
    }
}
