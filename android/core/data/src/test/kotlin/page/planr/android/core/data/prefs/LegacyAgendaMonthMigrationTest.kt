package page.planr.android.core.data.prefs

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking

/**
 * [LegacyAgendaMonthMigration] on a real `planr_view` file, as the app opens
 * it ([page.planr.android.core.data.di.PreferencesModule]): an older
 * version's file is folded on the first read, and only once.
 */
class LegacyAgendaMonthMigrationTest {
    private val dir: File = Files.createTempDirectory("planr-view").toFile()
    private val file = File(dir, "view_test.preferences_pb")

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    /** One DataStore per file at a time (DataStore enforces it): [block] gets a fresh one, closed after. */
    private fun <T> withStore(migrate: Boolean, block: suspend (DataStore<Preferences>) -> T): T = runBlocking {
        val job = Job()
        val store = PreferenceDataStoreFactory.create(
            migrations = if (migrate) listOf(LegacyAgendaMonthMigration) else emptyList(),
            scope = CoroutineScope(Dispatchers.IO + job),
            produceFile = { file },
        )
        try {
            block(store)
        } finally {
            job.cancelAndJoin()
        }
    }

    @Test
    fun `an older version's month over a synced week opens as a pending month`() {
        withStore(migrate = false) { old ->
            old.edit {
                it[ViewKeys.AGENDA_MODE] = "week"
                it[ViewKeys.LEGACY_AGENDA_MONTH] = true
            }
        }

        val migrated = withStore(migrate = true) { it.data.first() }

        assertEquals("month", migrated[ViewKeys.AGENDA_MODE])
        assertNull(migrated[ViewKeys.LEGACY_AGENDA_MONTH])
        assertEquals(1L, migrated[ViewKeys.SYNC_PENDING])
        // Written back: the next start has nothing left to fold.
        val reopened = withStore(migrate = true) { it.data.first() }
        assertEquals(migrated, reopened)
    }

    @Test
    fun `a store without the old key is left as it is`() {
        withStore(migrate = false) { old -> old.edit { it[ViewKeys.AGENDA_MODE] = "week" } }

        val read = withStore(migrate = true) { it.data.first() }

        assertEquals("week", read[ViewKeys.AGENDA_MODE])
        assertNull(read[ViewKeys.SYNC_PENDING])
    }
}
