package page.planr.android.core.data.appearance

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import androidx.test.core.app.ApplicationProvider
import kotlin.test.Test
import kotlin.test.assertEquals
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** [AndroidAppearancePlatform.skipAppCompatLocaleMigration] against Robolectric's package manager (API 35). */
@RunWith(RobolectricTestRunner::class)
class AndroidAppearancePlatformTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val holder = ComponentName(context, "androidx.appcompat.app.AppLocalesMetadataHolderService")

    private fun holderState() = context.packageManager.getComponentEnabledSetting(holder)

    @Test
    @Config(sdk = [35])
    fun `from Android 13 AppCompat's language copy is marked done`() {
        AndroidAppearancePlatform(context).skipAppCompatLocaleMigration()

        assertEquals(PackageManager.COMPONENT_ENABLED_STATE_ENABLED, holderState())
    }
}
