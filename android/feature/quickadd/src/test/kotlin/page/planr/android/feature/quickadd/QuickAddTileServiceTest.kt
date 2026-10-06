package page.planr.android.feature.quickadd

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.test.core.app.ApplicationProvider
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionInfo

/** The Quick Settings tile's target ([QuickAddTileService.intentFor]). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class QuickAddTileServiceTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    private val signedIn = AuthState.SignedIn(SessionInfo(userId = "u1", memberId = "m1", workspaceId = "ws"))

    private fun Intent.assertQuickAddTask() {
        assertEquals(ComponentName(context, QuickAddActivity::class.java), component)
        assertEquals(QuickAddKind.Task.name, getStringExtra(QuickAddActivity.EXTRA_MODE))
        assertEquals(QuickAddKind.Task, QuickAddActivity.kindOf(this))
        // Started from the shade's own context, outside any task.
        assertTrue(flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
    }

    @Test
    fun `signed in, it opens Quick add on a task`() {
        QuickAddTileService.intentFor(context, signedIn).assertQuickAddTask()
    }

    @Test
    fun `while the session is still being read, it opens Quick add too`() {
        QuickAddTileService.intentFor(context, AuthState.Loading).assertQuickAddTask()
    }

    @Test
    fun `signed out, it opens the app to sign in`() {
        // The app module's launcher activity, as this module's manifest has none.
        val launcher = ComponentName(context.packageName, "page.planr.android.MainActivity")
        shadowOf(context.packageManager).apply {
            addActivityIfNotPresent(launcher)
            addIntentFilterForActivity(launcher, IntentFilter(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_LAUNCHER) })
        }

        val intent = QuickAddTileService.intentFor(context, AuthState.SignedOut())

        assertEquals(launcher, intent.component)
        assertTrue(intent.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
    }
}
