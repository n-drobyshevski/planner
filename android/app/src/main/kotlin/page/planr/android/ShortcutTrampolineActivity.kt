package page.planr.android

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import page.planr.android.widgets.WidgetLaunch

/**
 * The Tasks launcher shortcut's target: an invisible hop to [MainActivity].
 *
 * The system starts a static shortcut's intent with `FLAG_ACTIVITY_NEW_TASK |
 * FLAG_ACTIVITY_CLEAR_TASK`. Aimed at [MainActivity] directly, that would
 * finish the running app, and any unsaved editor draft with it, and start it
 * afresh. This activity has its own empty task affinity (see the manifest),
 * so the clear only empties its own throwaway task. It passes the route on
 * with `FLAG_ACTIVITY_NEW_TASK` alone: the singleTask [MainActivity] comes
 * forward in its existing task and gets the route in `onNewIntent`, where the
 * nav host keeps an open editor (`isEditorRoute`), as for a widget tap.
 */
class ShortcutTrampolineActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Theme.NoDisplay: finish before onResume.
        startActivity(
            Intent(this, MainActivity::class.java)
                .setAction(WidgetLaunch.ACTION_OPEN)
                .apply { WidgetLaunch.routeOf(intent)?.let { putExtra(WidgetLaunch.EXTRA_ROUTE, it) } }
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        finish()
    }
}
