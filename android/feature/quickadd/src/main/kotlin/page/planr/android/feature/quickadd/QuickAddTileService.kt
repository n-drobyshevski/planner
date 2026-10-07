package page.planr.android.feature.quickadd

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import page.planr.android.core.data.auth.AuthState
import page.planr.android.core.data.auth.SessionManager

/**
 * The "Add to Planr" Quick Settings tile: an action, not a toggle, so it
 * stays inactive. A tap collapses the shade and opens Quick add on a task
 * ([QuickAddActivity]), as the widget's New task button does; on a locked
 * phone, once it is unlocked. Signed out, it opens the app to sign in.
 */
@AndroidEntryPoint
class QuickAddTileService : TileService() {

    @Inject
    lateinit var sessionManager: SessionManager

    override fun onStartListening() {
        super.onStartListening()
        val tile = qsTile ?: return
        // Read each time the shade opens: it follows a language changed since.
        tile.label = getString(R.string.quickadd_tile_label)
        tile.state = Tile.STATE_INACTIVE
        tile.updateTile()
    }

    override fun onClick() {
        super.onClick()
        if (isLocked) unlockAndRun(::open) else open()
    }

    private fun open() {
        val intent = intentFor(this, sessionManager.authState.value)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startActivityAndCollapse(
                PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT),
            )
        } else {
            startActivityAndCollapseBefore34(intent)
        }
    }

    // The PendingIntent overload is API 34+; from 34 (targeting it) this one throws.
    @SuppressLint("StartActivityAndCollapseDeprecated")
    @Suppress("DEPRECATION")
    private fun startActivityAndCollapseBefore34(intent: Intent) = startActivityAndCollapse(intent)

    internal companion object {
        /**
         * Quick add on a task; while the stored session is still being read
         * (a few ms after a cold start) too, as the sheet itself says when
         * there is no session. Signed out or unconfigured, the app.
         */
        fun intentFor(context: Context, auth: AuthState): Intent = when (auth) {
            is AuthState.SignedIn, AuthState.Loading -> QuickAddActivity.intent(context, QuickAddKind.Task)
            is AuthState.SignedOut, AuthState.Unconfigured ->
                context.packageManager.getLaunchIntentForPackage(context.packageName)
                    ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    ?: QuickAddActivity.intent(context, QuickAddKind.Task)
        }
    }
}
